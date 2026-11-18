import { TTSProvider, TTSError } from './TTSProvider';
import type { TTSOptions, TTSResult, Voice, TTSProviderType } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';

// OpenAI TTS available voices - works with all TTS models
const OPENAI_VOICES = [
  { id: 'alloy', name: 'Alloy', gender: 'neutral' as const },
  { id: 'ash', name: 'Ash', gender: 'male' as const },
  { id: 'ballad', name: 'Ballad', gender: 'male' as const },
  { id: 'coral', name: 'Coral', gender: 'female' as const },
  { id: 'echo', name: 'Echo', gender: 'male' as const },
  { id: 'fable', name: 'Fable', gender: 'neutral' as const },
  { id: 'onyx', name: 'Onyx', gender: 'male' as const },
  { id: 'nova', name: 'Nova', gender: 'female' as const },
  { id: 'sage', name: 'Sage', gender: 'female' as const },
  { id: 'shimmer', name: 'Shimmer', gender: 'female' as const },
  { id: 'verse', name: 'Verse', gender: 'male' as const },
] as const;

type OpenAITTSModel = 'tts-1' | 'tts-1-hd';

interface OpenAITTSRequest {
  model: string;
  input: string;
  voice: string;
  response_format?: 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';
  speed?: number;
}

/** TTS provider for the OpenAI text-to-speech API. */
export class OpenAIProvider extends TTSProvider {
  readonly providerType: TTSProviderType = 'openai';
  readonly providerName = 'OpenAI TTS';
  readonly supportsWordTiming = false;
  readonly maxChunkLength = 4096;
  readonly supportsStreaming = true;

  private readonly baseUrl: string;
  private readonly model: OpenAITTSModel;

  constructor(
    apiKey: string,
    options?: {
      baseUrl?: string;
      model?: OpenAITTSModel;
    }
  ) {
    super(apiKey);

    // Always use direct OpenAI API for TTS (OpenRouter doesn't support TTS)
    this.baseUrl = options?.baseUrl || 'https://api.openai.com/v1';
    this.model = options?.model || 'tts-1-hd'; // tts-1-hd is highest quality
  }

  /** Synthesize speech using the OpenAI TTS API. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isConfigured()) {
      throw new TTSError('OpenAI API key not configured', 'openai', 'NOT_CONFIGURED');
    }
    this.validateText(options);

    const speed = Math.max(0.25, Math.min(4.0, options.speed || 1.0));

    const requestBody: OpenAITTSRequest = {
      model: options.modelId || this.model,
      input: options.text,
      voice: options.voiceId || 'alloy',
      response_format: 'mp3',
      speed,
    };

    try {
      const response = await fetch(`${this.baseUrl}/audio/speech`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TTSError(
          errorData.error?.message || `OpenAI API error: ${response.status}`,
          'openai',
          errorData.error?.code,
          response.status
        );
      }

      const audioBlob = await response.blob();
      const audioUrl = this.createAudioUrl(audioBlob);
      const duration = this.estimateDuration(audioBlob);

      // Estimate word timing from text and duration
      const timing = estimateWordTiming(options.text, duration);

      return {
        audioBlob,
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
        'openai'
      );
    }
  }

  async getVoices(): Promise<Voice[]> {
    return OPENAI_VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      provider: 'openai' as TTSProviderType,
      language: 'en',
      gender: voice.gender,
    }));
  }

  estimateCost(charCount: number): number {
    // OpenAI TTS pricing (as of 2024):
    // tts-1: $15.00 / 1M characters
    // tts-1-hd: $30.00 / 1M characters
    const pricePerChar = this.model === 'tts-1-hd' ? 0.00003 : 0.000015;
    return charCount * pricePerChar;
  }

}
