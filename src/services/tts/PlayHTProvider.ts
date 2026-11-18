import { TTSProvider, TTSError } from './TTSProvider';
import type { TTSOptions, TTSResult, Voice, TTSProviderType } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';

// Popular PlayHT voices
const DEFAULT_VOICES = [
  { id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json', name: 'Jennifer', gender: 'female' as const },
  { id: 's3://voice-cloning-zero-shot/820da3d2-3a3b-42e7-844d-e68db835a206/sarah/manifest.json', name: 'Sarah', gender: 'female' as const },
  { id: 's3://voice-cloning-zero-shot/65977f5e-a22a-4b36-861b-ecede19bdd65/henry/manifest.json', name: 'Henry', gender: 'male' as const },
  { id: 's3://voice-cloning-zero-shot/e040bd1b-f190-4bdb-83f0-75ef85b18f84/michael/manifest.json', name: 'Michael', gender: 'male' as const },
] as const;

interface PlayHTTTSRequest {
  text: string;
  voice: string;
  output_format: string;
  voice_engine: string;
  quality?: string;
  speed?: number;
}

interface PlayHTVoiceResponse {
  id: string;
  name: string;
  language_code: string;
  gender: string;
  sample?: string;
}

/** TTS provider for the PlayHT speech synthesis API. */
export class PlayHTProvider extends TTSProvider {
  readonly providerType: TTSProviderType = 'playht';
  readonly providerName = 'PlayHT';
  readonly supportsWordTiming = false;
  readonly maxChunkLength = 3000;
  readonly supportsStreaming = true;

  private readonly baseUrl = 'https://api.play.ht/api/v2';

  constructor(
    apiKey: string,
    private readonly userId: string
  ) {
    super(apiKey);
  }

  /** Synthesize speech using the PlayHT v2 TTS API. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isConfigured() || !this.userId) {
      throw new TTSError('PlayHT API key or User ID not configured', 'playht', 'NOT_CONFIGURED');
    }
    this.validateText(options);

    const speed = options.speed || 1.0;

    const requestBody: PlayHTTTSRequest = {
      text: options.text,
      voice: options.voiceId || DEFAULT_VOICES[0].id,
      output_format: 'mp3',
      voice_engine: 'PlayHT2.0',
      quality: 'premium',
      speed,
    };

    try {
      const response = await fetch(`${this.baseUrl}/tts`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-USER-ID': this.userId,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TTSError(
          errorData.error_message || `PlayHT API error: ${response.status}`,
          'playht',
          errorData.error_code,
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
        'playht'
      );
    }
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.isConfigured() || !this.userId) {
      return DEFAULT_VOICES.map((voice) => ({
        id: voice.id,
        name: voice.name,
        provider: 'playht' as TTSProviderType,
        language: 'en',
        gender: voice.gender,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'X-USER-ID': this.userId,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const voices: PlayHTVoiceResponse[] = await response.json();

      return voices.slice(0, 50).map((voice) => ({
        id: voice.id,
        name: voice.name,
        provider: 'playht' as TTSProviderType,
        language: voice.language_code || 'en',
        gender: (voice.gender?.toLowerCase() as 'male' | 'female' | 'neutral') || 'neutral',
        previewUrl: voice.sample,
      }));
    } catch (e: unknown) {
      console.warn('PlayHT: Failed to fetch voices, using defaults:', e);
      return DEFAULT_VOICES.map((voice) => ({
        id: voice.id,
        name: voice.name,
        provider: 'playht' as TTSProviderType,
        language: 'en',
        gender: voice.gender,
      }));
    }
  }

  estimateCost(charCount: number): number {
    // PlayHT pricing:
    // Creator: $31.20/mo for 200k chars ($0.000156/char)
    // Unlimited: $99/mo for 500k chars ($0.000198/char)
    // Average: ~$0.00017/char
    return charCount * 0.00017;
  }
}
