import { BrowserTTSProvider } from './BrowserTTSProvider';
import type { TTSOptions, TTSResult, Voice } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';
import { reportModelError, reportModelProgress, reportModelReady, LOCAL_MODEL_SIZES_MB } from './modelDownload';

/**
 * Piper TTS Provider - Multi-language local text-to-speech.
 *
 * Uses Piper TTS models running via WASM in the browser.
 * Voices are limited to those in piper-tts-web's voice map (checked by tests).
 *
 * Key characteristics:
 * - 20-115 MB per voice model (the default US English voice is ~63 MB), cached in the browser (OPFS)
 * - Wide language support (English, Spanish, German, French, etc.)
 * - Pure WASM - works in all modern browsers
 *
 * @see https://www.npmjs.com/package/@mintplex-labs/piper-tts-web
 */
export class PiperProvider extends BrowserTTSProvider {
  readonly providerType = 'piper' as const;
  readonly providerName = 'Piper TTS (Multi-Language)';
  readonly supportsWordTiming = false; // Uses estimated timing
  readonly maxChunkLength = 5000;
  readonly supportsStreaming = false;

  private piperModule: PiperTTSModule | null = null;
  /** Voice the shared piper-tts-web session currently has loaded. */
  private sessionVoice: string | null = null;
  private downloadedVoices = new Set<string>();
  private isInitializing = false;
  private initPromise: Promise<void> | null = null;

  static readonly MODEL_SIZE_PER_VOICE = LOCAL_MODEL_SIZES_MB.piper * 1000 * 1000;

  // Popular Piper voices (subset of available voices)
  static readonly VOICES: Voice[] = [
    // English (US)
    { id: 'en_US-hfc_female-medium', name: 'HFC Female (US English)', provider: 'piper', language: 'en-US', gender: 'female' },
    { id: 'en_US-amy-medium', name: 'Amy (US English)', provider: 'piper', language: 'en-US', gender: 'female' },
    { id: 'en_US-danny-low', name: 'Danny (US English)', provider: 'piper', language: 'en-US', gender: 'male' },
    { id: 'en_US-lessac-medium', name: 'Lessac (US English)', provider: 'piper', language: 'en-US', gender: 'female' },
    // English (GB)
    { id: 'en_GB-alan-medium', name: 'Alan (British)', provider: 'piper', language: 'en-GB', gender: 'male' },
    { id: 'en_GB-jenny_dioco-medium', name: 'Jenny (British)', provider: 'piper', language: 'en-GB', gender: 'female' },
    // German
    { id: 'de_DE-thorsten-high', name: 'Thorsten (German)', provider: 'piper', language: 'de-DE', gender: 'male' },
    { id: 'de_DE-eva_k-x_low', name: 'Eva (German)', provider: 'piper', language: 'de-DE', gender: 'female' },
    // French
    { id: 'fr_FR-siwis-medium', name: 'Siwis (French)', provider: 'piper', language: 'fr-FR', gender: 'female' },
    { id: 'fr_FR-tom-medium', name: 'Tom (French)', provider: 'piper', language: 'fr-FR', gender: 'male' },
    // Spanish
    { id: 'es_ES-sharvard-medium', name: 'Sharvard (Spanish)', provider: 'piper', language: 'es-ES', gender: 'male' },
    { id: 'es_MX-claude-high', name: 'Claude (Mexican Spanish)', provider: 'piper', language: 'es-MX', gender: 'male' },
    // Italian
    { id: 'it_IT-riccardo-x_low', name: 'Riccardo (Italian)', provider: 'piper', language: 'it-IT', gender: 'male' },
    // Portuguese
    { id: 'pt_BR-faber-medium', name: 'Faber (Brazilian Portuguese)', provider: 'piper', language: 'pt-BR', gender: 'male' },
    // Dutch
    { id: 'nl_NL-mls-medium', name: 'MLS (Dutch)', provider: 'piper', language: 'nl-NL', gender: 'neutral' },
    // Polish
    { id: 'pl_PL-gosia-medium', name: 'Gosia (Polish)', provider: 'piper', language: 'pl-PL', gender: 'female' },
    // Russian
    { id: 'ru_RU-irina-medium', name: 'Irina (Russian)', provider: 'piper', language: 'ru-RU', gender: 'female' },
    // Chinese
    { id: 'zh_CN-huayan-medium', name: 'Huayan (Chinese)', provider: 'piper', language: 'zh-CN', gender: 'female' },
  ];

  isSupported(): boolean {
    return this.hasWASM();
  }

  async isReady(): Promise<boolean> {
    return this.isSupported() && this.downloadedVoices.size > 0;
  }

  async download(onProgress?: (progress: number) => void): Promise<void> {
    if (this.piperModule) return;

    // Prevent concurrent initialization
    if (this.isInitializing && this.initPromise) {
      return this.initPromise;
    }

    this.isInitializing = true;
    this.initPromise = this.initializeModule(onProgress);

    try {
      await this.initPromise;
    } finally {
      this.isInitializing = false;
      this.initPromise = null;
    }
  }

  private async initializeModule(_onProgress?: (progress: number) => void): Promise<void> {
    // Dynamic import with error handling for network/module failures
    try {
      this.piperModule = (await import('@mintplex-labs/piper-tts-web')) as unknown as PiperTTSModule;
    } catch (importError) {
      const message = importError instanceof Error ? importError.message : 'Unknown error';
      throw new Error(`Failed to load Piper TTS library: ${message}. Check your network connection.`);
    }
  }

  /**
   * Download a specific voice model and load it.
   *
   * Goes through the session (which awaits its cache write) rather than the
   * library's download(), which writes to OPFS without awaiting and can leave a
   * half-written model that later fails with "No graph was found in the protobuf".
   */
  async downloadVoice(
    voiceId: string,
    onProgress?: (progress: number) => void
  ): Promise<void> {
    if (!this.piperModule) {
      await this.download();
    }

    if (!this.piperModule) {
      throw new Error('Failed to initialize Piper TTS');
    }

    if (this.downloadedVoices.has(voiceId) && this.sessionVoice === voiceId) {
      return; // Already downloaded and loaded
    }

    try {
      await this.ensureSession(voiceId, onProgress);
    } catch (error) {
      reportModelError('piper', error instanceof Error ? error.message : 'Download failed');
      throw error;
    }

    reportModelReady('piper');
    this.downloadedVoices.add(voiceId);
  }

  getDownloadSize(): number {
    return PiperProvider.MODEL_SIZE_PER_VOICE;
  }

  async getVoices(): Promise<Voice[]> {
    return PiperProvider.VOICES;
  }

  /**
   * Get list of cached voice models.
   */
  async getDownloadedVoices(): Promise<string[]> {
    if (!this.piperModule) {
      return [];
    }

    const stored = await this.piperModule.stored();
    return stored || [];
  }

  /** Synthesize speech locally using a Piper WASM voice model. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.piperModule) {
      await this.download();
    }

    if (!this.piperModule) {
      throw new Error('Failed to initialize Piper TTS');
    }

    const voiceId = options.voiceId || 'en_US-hfc_female-medium';

    // Ensure the voice is downloaded and loaded into the session
    await this.downloadVoice(voiceId);

    let wavBlob: Blob;
    try {
      wavBlob = await this.piperModule.predict({ text: options.text, voiceId });
    } catch (error) {
      reportModelError('piper', error instanceof Error ? error.message : 'Piper failed');
      throw error;
    }

    const audioUrl = this.createAudioUrl(wavBlob);
    const duration = await this.getAudioDuration(wavBlob);

    return {
      audioBlob: wavBlob,
      audioUrl,
      duration,
      timing: estimateWordTiming(options.text, duration),
    };
  }

  /**
   * Create the shared piper-tts-web session with WASM paths that match the
   * installed onnxruntime-web. The library's default (cdnjs 1.18.0) does not
   * match the bundled runtime and 404s. The library also keeps one global
   * session that never reloads its model, so reset it when the voice changes.
   */
  private async ensureSession(voiceId: string, onProgress?: (progress: number) => void): Promise<void> {
    const mod = this.piperModule!;
    if (this.sessionVoice === voiceId && mod.TtsSession._instance) return;
    const ort = await import('onnxruntime-web');
    const version = ort.env.versions?.web || PIPER_ORT_VERSION;
    // Keep ORT's benign warnings (e.g. "Unknown CPU vendor") out of console.error.
    ort.env.logLevel = 'error';
    const create = () => {
      mod.TtsSession._instance = null;
      return mod.TtsSession.create({
        voiceId,
        progress: (p: { loaded: number; total: number }) => {
          if (p.total > 0) {
            reportModelProgress('piper', p.loaded, p.total);
            onProgress?.((p.loaded / p.total) * 100);
          }
        },
        wasmPaths: {
          onnxWasm: `https://cdn.jsdelivr.net/npm/onnxruntime-web@${version}/dist/`,
          piperData: `${mod.WASM_BASE}.data`,
          piperWasm: `${mod.WASM_BASE}.wasm`,
        },
      });
    };
    try {
      await create();
    } catch (error) {
      // A model file cached by an interrupted download is unreadable; clear it once and retry.
      const message = error instanceof Error ? error.message : String(error);
      if (!/protobuf|graph/i.test(message)) throw error;
      mod.TtsSession._instance = null;
      await mod.remove(voiceId);
      await create();
    }
    this.sessionVoice = voiceId;
  }

  /**
   * Remove a cached voice model.
   */
  async removeVoice(voiceId: string): Promise<void> {
    if (!this.piperModule) return;

    await this.piperModule.remove(voiceId);
    this.downloadedVoices.delete(voiceId);
  }

  /**
   * Clear all cached voice models.
   */
  async clearCache(): Promise<void> {
    if (!this.piperModule) return;

    await this.piperModule.flush();
    this.downloadedVoices.clear();
  }

  /**
   * Clean up resources.
   */
  override dispose(): void {
    super.dispose(); // Clean up blob URLs tracked by base class
    this.piperModule = null;
    this.sessionVoice = null;
    this.downloadedVoices.clear();
  }
}

/** onnxruntime-web version the CSP allows (see vercel.json); checked by csp.test.ts. */
export const PIPER_ORT_VERSION = '1.23.2';

interface PiperWasmPaths {
  onnxWasm: string;
  piperData: string;
  piperWasm: string;
}

interface PiperTtsSessionStatic {
  _instance: unknown;
  create(options: {
    voiceId: string;
    progress?: (p: { loaded: number; total: number }) => void;
    wasmPaths?: PiperWasmPaths;
  }): Promise<unknown>;
}

// Type declarations for @mintplex-labs/piper-tts-web
interface PiperTTSModule {
  TtsSession: PiperTtsSessionStatic;
  WASM_BASE: string;
  predict(options: { text: string; voiceId: string }): Promise<Blob>;
  download(voiceId: string, onProgress?: (progress: { loaded: number; total: number }) => void): Promise<void>;
  stored(): Promise<string[]>;
  remove(voiceId: string): Promise<void>;
  flush(): Promise<void>;
  voices(): Promise<Record<string, unknown>>;
}

declare module '@mintplex-labs/piper-tts-web' {
  export function predict(options: { text: string; voiceId: string }): Promise<Blob>;
  export function download(voiceId: string, onProgress?: (progress: { loaded: number; total: number }) => void): Promise<void>;
  export function stored(): Promise<string[]>;
  export function remove(voiceId: string): Promise<void>;
  export function flush(): Promise<void>;
  export function voices(): Promise<Record<string, unknown>>;
}
