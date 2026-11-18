import { BrowserTTSProvider } from './BrowserTTSProvider';
import type { TTSOptions, TTSResult, Voice } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';
import type { KokoroTTS as KokoroTTSType } from 'kokoro-js';
import {
  MultiFileProgress,
  isUrlCached,
  reportModelError,
  reportModelProgress,
  reportModelReady,
  LOCAL_MODEL_SIZES_MB,
} from './modelDownload';
import {
  KOKORO_MAX_INPUT_IDS,
  concatSamples,
  encodeFloatWav,
  planWithinBudget,
} from './kokoroTokenBudget';

type KokoroVoiceId = Parameters<KokoroTTSType['generate']>[1] extends infer O
  ? O extends { voice?: infer V } ? V : never
  : never;
type KokoroInputIds = Parameters<KokoroTTSType['generate_from_ids']>[0];

const KOKORO_MODEL_ID = 'onnx-community/Kokoro-82M-v1.0-ONNX';
/** URL transformers.js stores in Cache Storage once the q8 model has downloaded. */
export const KOKORO_MODEL_URL = `https://huggingface.co/${KOKORO_MODEL_ID}/resolve/main/onnx/model_quantized.onnx`;

/**
 * Kokoro TTS Provider - High-quality local text-to-speech.
 *
 * Uses the Kokoro 82M parameter model running entirely in the browser
 * via WASM or WebGPU. Provides near-API quality voice synthesis.
 *
 * Key characteristics:
 * - ~93 MB one-time download (q8 model), cached by the browser (Cache Storage)
 * - English only (American and British accents)
 * - 24kHz audio output
 * - Runs on the WASM backend everywhere. The q8 model is the small download;
 *   WebGPU would need the 326 MB fp32 model and is not reliable on phones.
 *   Devices without WebAssembly fall back to the browser's built-in voice.
 *
 * @see https://www.npmjs.com/package/kokoro-js
 */
export class KokoroProvider extends BrowserTTSProvider {
  readonly providerType = 'kokoro' as const;
  readonly providerName = 'Kokoro TTS (High Quality)';
  readonly supportsWordTiming = false; // Uses estimated timing
  /**
   * Target size for Full Audio chunks. kokoro-js truncates each generate() call at
   * 510 phoneme tokens, and numbers or abbreviations can exceed that well under 300
   * characters, so synthesize() also measures real tokens and splits anything over
   * the limit (see kokoroTokenBudget.ts). This value only keeps chunks short.
   */
  readonly maxChunkLength = 300;
  // No stream path: kokoro-js's own stream() splits inside amounts such as
  // "$98,765.43" and truncates long sentences. synthesize() covers any length.
  readonly supportsStreaming = false;

  private kokoroInstance: KokoroTTSType | null = null;
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  static readonly MODEL_SIZE = LOCAL_MODEL_SIZES_MB.kokoro * 1000 * 1000;
  static readonly SAMPLE_RATE = 24000;

  // Available Kokoro voices
  static readonly VOICES: Voice[] = [
    // American English Female
    { id: 'af_heart', name: 'Heart (American Female)', provider: 'kokoro', language: 'en-US', gender: 'female' },
    { id: 'af_bella', name: 'Bella (American Female)', provider: 'kokoro', language: 'en-US', gender: 'female' },
    { id: 'af_nicole', name: 'Nicole (American Female)', provider: 'kokoro', language: 'en-US', gender: 'female' },
    { id: 'af_sarah', name: 'Sarah (American Female)', provider: 'kokoro', language: 'en-US', gender: 'female' },
    // American English Male
    { id: 'am_michael', name: 'Michael (American Male)', provider: 'kokoro', language: 'en-US', gender: 'male' },
    { id: 'am_fenrir', name: 'Fenrir (American Male)', provider: 'kokoro', language: 'en-US', gender: 'male' },
    // British English Female
    { id: 'bf_emma', name: 'Emma (British Female)', provider: 'kokoro', language: 'en-GB', gender: 'female' },
    { id: 'bf_isabella', name: 'Isabella (British Female)', provider: 'kokoro', language: 'en-GB', gender: 'female' },
    { id: 'bf_alice', name: 'Alice (British Female)', provider: 'kokoro', language: 'en-GB', gender: 'female' },
    // British English Male
    { id: 'bm_george', name: 'George (British Male)', provider: 'kokoro', language: 'en-GB', gender: 'male' },
    { id: 'bm_lewis', name: 'Lewis (British Male)', provider: 'kokoro', language: 'en-GB', gender: 'male' },
    { id: 'bm_fable', name: 'Fable (British Male)', provider: 'kokoro', language: 'en-GB', gender: 'male' },
  ];

  isSupported(): boolean {
    // Runs on the WASM backend (see class comment).
    return this.hasWASM();
  }

  /** Whether the model is already in the browser cache (no download needed). */
  static isCached(): Promise<boolean> {
    return isUrlCached('transformers-cache', KOKORO_MODEL_URL);
  }

  async isReady(): Promise<boolean> {
    if (!this.isSupported()) return false;
    return this.kokoroInstance !== null;
  }

  async download(onProgress?: (progress: number) => void): Promise<void> {
    if (this.kokoroInstance) return;

    // Prevent concurrent initialization
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this.initializeModel(onProgress);

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  private async initializeModel(onProgress?: (progress: number) => void): Promise<void> {
    // Dynamic import with error handling for network/module failures
    let KokoroTTS: typeof KokoroTTSType;
    try {
      const module = await import('kokoro-js');
      KokoroTTS = module.KokoroTTS;
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'Unknown error';
      throw new Error(`Failed to load Kokoro TTS library: ${message}. Check your network connection.`);
    }

    // Run ONNX inference in a worker (ORT's wasm proxy) so synthesis does not
    // freeze the page. kokoro-js shares this transformers.js instance.
    try {
      const { env } = await import('@huggingface/transformers');
      const wasm = env.backends.onnx.wasm;
      if (wasm) wasm.proxy = true;
    } catch {
      // Without the proxy, inference still works on the main thread.
    }

    // q8 on WASM: the smallest download and the most portable backend.
    const device = 'wasm' as const;
    const dtype = 'q8' as const;
    const tracker = new MultiFileProgress();
    // transformers.js reports per-file progress even when reading from Cache Storage.
    // A cached model is not a download, so report nothing until it is ready.
    const alreadyCached = await KokoroProvider.isCached();

    try {
      this.kokoroInstance = await KokoroTTS.from_pretrained(KOKORO_MODEL_ID, {
        dtype,
        device,
        progress_callback: (progress: { status: string; file?: string; loaded?: number; total?: number }) => {
          if (alreadyCached || progress.status !== 'progress' || !progress.file || !progress.total) return;
          const { loaded, total } = tracker.update(progress.file, progress.loaded ?? 0, progress.total);
          reportModelProgress('kokoro', loaded, total);
          onProgress?.(total > 0 ? (loaded / total) * 100 : 0);
        },
      });
      reportModelReady('kokoro');
    } catch (modelError) {
      const message = modelError instanceof Error ? modelError.message : 'Unknown error';
      reportModelError('kokoro', message);
      throw new Error(`Failed to load the Kokoro voice model: ${message}. Try again, or choose the browser's built-in voice in Settings.`);
    }
  }

  getDownloadSize(): number {
    return KokoroProvider.MODEL_SIZE;
  }

  async getVoices(): Promise<Voice[]> {
    return KokoroProvider.VOICES;
  }

  /**
   * Count the untruncated input ids for `text` by running kokoro-js's own
   * generate() (same normalization, phonemizer and tokenizer) with inference
   * replaced. Returns null if kokoro-js no longer has the expected shape or throws.
   */
  private async measureInputIds(
    instance: KokoroTTSType,
    text: string,
    voice: KokoroVoiceId
  ): Promise<{ ids: KokoroInputIds; count: number } | null> {
    let captured: KokoroInputIds | null = null;
    const probe = {
      _validate_voice: (v: unknown) => instance._validate_voice(v),
      tokenizer: (phonemes: string) =>
        (instance.tokenizer as unknown as (p: string, o: { truncation: boolean }) => { input_ids: KokoroInputIds })(
          phonemes,
          { truncation: false }
        ),
      generate_from_ids: async (ids: KokoroInputIds) => {
        captured = ids;
        return ids;
      },
    };
    try {
      await (instance.generate as (this: unknown, t: string, o: { voice: KokoroVoiceId }) => Promise<unknown>).call(
        probe,
        text,
        { voice }
      );
    } catch {
      // A future generate() that needs more than the probe offers: use the library path.
      return null;
    }
    const ids = captured as KokoroInputIds | null;
    const count = ids?.dims?.at(-1);
    if (!ids || typeof count !== 'number') return null;
    return { ids, count };
  }

  /**
   * Generate audio for all of `text`. Text over Kokoro's 510-token input limit is
   * split at sentence, clause or word boundaries and the audio joined, so nothing
   * is silently dropped.
   */
  private async generateAll(
    text: string,
    voice: KokoroVoiceId,
    speed: number
  ): Promise<{ samples: Float32Array; sampleRate: number; blob: Blob; pieces: number }> {
    const instance = this.kokoroInstance;
    if (!instance) throw new Error('Failed to initialize Kokoro TTS model');

    let shapeChanged = false;
    const pieces = await planWithinBudget(
      text,
      async (piece) => {
        const measured = shapeChanged ? null : await this.measureInputIds(instance, piece, voice);
        if (!measured) {
          shapeChanged = true;
          return { ids: null as unknown as KokoroInputIds, count: 0 };
        }
        return measured;
      },
      KOKORO_MAX_INPUT_IDS
    );

    if (shapeChanged || pieces.length === 0) {
      // Unknown kokoro-js shape or blank text: fall back to the library's own path,
      // which may shorten long text. kokoro-js is pinned to 1.2.1 so this stays unused.
      const result = await instance.generate(text, { voice, speed });
      return {
        samples: result.audio,
        sampleRate: result.sampling_rate ?? KokoroProvider.SAMPLE_RATE,
        blob: result.toBlob(),
        pieces: 1,
      };
    }

    if (pieces.length === 1) {
      const result = await instance.generate_from_ids(pieces[0].ids, { voice, speed });
      return {
        samples: result.audio,
        sampleRate: result.sampling_rate ?? KokoroProvider.SAMPLE_RATE,
        blob: result.toBlob(),
        pieces: 1,
      };
    }

    const parts: Float32Array[] = [];
    let sampleRate: number = KokoroProvider.SAMPLE_RATE;
    for (const piece of pieces) {
      const result = await instance.generate_from_ids(piece.ids, { voice, speed });
      parts.push(result.audio);
      sampleRate = result.sampling_rate ?? sampleRate;
    }
    const samples = concatSamples(parts);
    return { samples, sampleRate, blob: encodeFloatWav(samples, sampleRate), pieces: pieces.length };
  }

  /** Synthesize speech locally using the Kokoro 82M ONNX model. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    // Ensure model is loaded
    if (!this.kokoroInstance) {
      await this.download();
    }

    if (!this.kokoroInstance) {
      throw new Error('Failed to initialize Kokoro TTS model');
    }

    const { samples, sampleRate, blob: audioBlob } = await this.generateAll(
      options.text,
      (options.voiceId || 'af_heart') as KokoroVoiceId,
      options.speed ?? 1.0
    );
    const audioUrl = this.createAudioUrl(audioBlob);

    // Calculate duration from samples
    const duration = samples.length / sampleRate;

    return {
      audioBlob,
      audioUrl,
      duration,
      timing: estimateWordTiming(options.text, duration),
    };
  }

  /**
   * Clean up resources when no longer needed.
   */
  dispose(): void {
    this.kokoroInstance = null;
  }
}
