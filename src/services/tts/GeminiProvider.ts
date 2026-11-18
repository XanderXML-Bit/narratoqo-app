import { TTSProvider, TTSError } from './TTSProvider';
import type { TTSOptions, TTSResult, Voice, TTSProviderType } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';

// Gemini TTS available voices (30 voices available)
const GEMINI_VOICES = [
  // Popular voices
  { id: 'Kore', name: 'Kore (Warm Female)', gender: 'female' as const },
  { id: 'Puck', name: 'Puck (Upbeat Male)', gender: 'male' as const },
  { id: 'Charon', name: 'Charon (Deep Male)', gender: 'male' as const },
  { id: 'Fenrir', name: 'Fenrir (Bold Male)', gender: 'male' as const },
  { id: 'Aoede', name: 'Aoede (Melodic Female)', gender: 'female' as const },
  { id: 'Zephyr', name: 'Zephyr (Bright)', gender: 'neutral' as const },
  { id: 'Orus', name: 'Orus (Firm Male)', gender: 'male' as const },
  { id: 'Leda', name: 'Leda (Youthful Female)', gender: 'female' as const },
  // Additional voices
  { id: 'Achernar', name: 'Achernar (Soft)', gender: 'neutral' as const },
  { id: 'Autonoe', name: 'Autonoe (Bright Female)', gender: 'female' as const },
  { id: 'Callirrhoe', name: 'Callirrhoe (Easy-going Female)', gender: 'female' as const },
  { id: 'Despina', name: 'Despina (Smooth Female)', gender: 'female' as const },
  { id: 'Erinome', name: 'Erinome (Clear Female)', gender: 'female' as const },
  { id: 'Gacrux', name: 'Gacrux (Mature Male)', gender: 'male' as const },
  { id: 'Iapetus', name: 'Iapetus (Clear Male)', gender: 'male' as const },
  { id: 'Keid', name: 'Keid (Upbeat)', gender: 'neutral' as const },
  { id: 'Alnilam', name: 'Alnilam (Firm)', gender: 'neutral' as const },
  { id: 'Schedar', name: 'Schedar (Even)', gender: 'neutral' as const },
  { id: 'Umbriel', name: 'Umbriel (Easy-going Male)', gender: 'male' as const },
  { id: 'Vindemiatrix', name: 'Vindemiatrix (Gentle)', gender: 'neutral' as const },
] as const;

interface GeminiTTSRequest {
  contents: {
    parts: {
      text: string;
    }[];
  }[];
  generationConfig: {
    responseModalities: string[];
    speechConfig: {
      voiceConfig: {
        prebuiltVoiceConfig: {
          voiceName: string;
        };
      };
    };
  };
}

/** TTS provider for the Google Gemini generative speech synthesis API. */
export class GeminiProvider extends TTSProvider {
  readonly providerType: TTSProviderType = 'gemini';
  readonly providerName = 'Google Gemini TTS';
  readonly supportsWordTiming = false;
  readonly maxChunkLength = 8000;
  readonly supportsStreaming = false;

  private readonly baseUrl: string;
  private readonly model: string;

  constructor(
    apiKey: string,
    options?: {
      model?: 'gemini-2.5-flash-preview-tts' | 'gemini-2.5-pro-preview-tts';
    }
  ) {
    super(apiKey);
    this.model = options?.model || 'gemini-2.5-flash-preview-tts';
    this.baseUrl = 'https://generativelanguage.googleapis.com/v1beta/models';
  }

  /** Synthesize speech using the Gemini generateContent API with PCM-to-WAV conversion. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isConfigured()) {
      throw new TTSError('Gemini API key not configured', 'gemini', 'NOT_CONFIGURED');
    }
    this.validateText(options);

    const voiceId = options.voiceId || 'Kore';

    const requestBody: GeminiTTSRequest = {
      contents: [
        {
          parts: [
            {
              text: options.text,
            },
          ],
        },
      ],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: {
              voiceName: voiceId,
            },
          },
        },
      },
    };

    try {
      const response = await fetch(
        `${this.baseUrl}/${this.model}:generateContent`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': this.apiKey,
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TTSError(
          errorData.error?.message || `Gemini API error: ${response.status}`,
          'gemini',
          errorData.error?.code,
          response.status
        );
      }

      const data = await response.json();

      // Extract audio from response - Gemini returns PCM audio
      const audioData = data.candidates?.[0]?.content?.parts?.[0]?.inlineData;

      if (!audioData?.data) {
        throw new TTSError('No audio data in Gemini response', 'gemini', 'NO_AUDIO');
      }

      // Gemini returns base64 encoded PCM audio (24kHz, 16-bit, mono)
      // Convert PCM to WAV for browser playback
      const pcmData = this.base64ToArrayBuffer(audioData.data);
      const wavBlob = this.pcmToWav(pcmData, 24000, 16, 1);
      const audioUrl = this.createAudioUrl(wavBlob);

      // Estimate duration from PCM data (24000 samples/sec, 2 bytes/sample)
      const duration = pcmData.byteLength / (24000 * 2);

      // Estimate word timing from text and duration
      const timing = estimateWordTiming(options.text, duration);

      return {
        audioBlob: wavBlob,
        audioUrl,
        duration,
        timing,
      };
    } catch (error) {
      if (error instanceof TTSError) {
        throw error;
      }
      throw new TTSError(
        error instanceof Error ? error.message : 'Unknown error during TTS generation',
        'gemini'
      );
    }
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  private pcmToWav(pcmData: ArrayBuffer, sampleRate: number, bitsPerSample: number, channels: number): Blob {
    const pcmBytes = new Uint8Array(pcmData);
    const wavHeader = new ArrayBuffer(44);
    const view = new DataView(wavHeader);

    // RIFF header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + pcmBytes.length, true);
    this.writeString(view, 8, 'WAVE');

    // fmt chunk
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // chunk size
    view.setUint16(20, 1, true); // PCM format
    view.setUint16(22, channels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * channels * (bitsPerSample / 8), true); // byte rate
    view.setUint16(32, channels * (bitsPerSample / 8), true); // block align
    view.setUint16(34, bitsPerSample, true);

    // data chunk
    this.writeString(view, 36, 'data');
    view.setUint32(40, pcmBytes.length, true);

    // Combine header and PCM data
    const wavBytes = new Uint8Array(44 + pcmBytes.length);
    wavBytes.set(new Uint8Array(wavHeader), 0);
    wavBytes.set(pcmBytes, 44);

    return new Blob([wavBytes], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  }

  async getVoices(): Promise<Voice[]> {
    return GEMINI_VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      provider: 'gemini' as TTSProviderType,
      language: 'en',
      gender: voice.gender,
    }));
  }

  estimateCost(charCount: number): number {
    // Gemini TTS pricing (estimated based on Gemini API pricing)
    // Flash model: ~$0.075 / 1M characters
    const pricePerChar = this.model.includes('flash') ? 0.000000075 : 0.00000015;
    return charCount * pricePerChar;
  }
}
