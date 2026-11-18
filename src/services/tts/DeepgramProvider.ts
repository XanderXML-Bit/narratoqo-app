import { TTSProvider, TTSError } from './TTSProvider';
import type { TTSOptions, TTSResult, Voice, TTSProviderType } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';

// Deepgram Aura voices
const DEEPGRAM_VOICES = [
  { id: 'aura-asteria-en', name: 'Asteria', gender: 'female' as const },
  { id: 'aura-luna-en', name: 'Luna', gender: 'female' as const },
  { id: 'aura-stella-en', name: 'Stella', gender: 'female' as const },
  { id: 'aura-athena-en', name: 'Athena', gender: 'female' as const },
  { id: 'aura-hera-en', name: 'Hera', gender: 'female' as const },
  { id: 'aura-orion-en', name: 'Orion', gender: 'male' as const },
  { id: 'aura-arcas-en', name: 'Arcas', gender: 'male' as const },
  { id: 'aura-perseus-en', name: 'Perseus', gender: 'male' as const },
  { id: 'aura-angus-en', name: 'Angus', gender: 'male' as const },
  { id: 'aura-orpheus-en', name: 'Orpheus', gender: 'male' as const },
  { id: 'aura-helios-en', name: 'Helios', gender: 'male' as const },
  { id: 'aura-zeus-en', name: 'Zeus', gender: 'male' as const },
] as const;

/** TTS provider for the Deepgram Aura speech synthesis API. */
export class DeepgramProvider extends TTSProvider {
  readonly providerType: TTSProviderType = 'deepgram';
  readonly providerName = 'Deepgram Aura';
  readonly supportsWordTiming = false;
  readonly maxChunkLength = 2000;
  readonly supportsStreaming = true;

  private readonly baseUrl = 'https://api.deepgram.com/v1/speak';

  constructor(apiKey: string) {
    super(apiKey);
  }

  /** Synthesize speech using the Deepgram Aura TTS API. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isConfigured()) {
      throw new TTSError('Deepgram API key not configured', 'deepgram', 'NOT_CONFIGURED');
    }
    this.validateText(options);

    const voiceId = options.voiceId || DEEPGRAM_VOICES[0].id;

    try {
      const url = new URL(this.baseUrl);
      url.searchParams.set('model', voiceId);

      const response = await fetch(url.toString(), {
        method: 'POST',
        headers: {
          'Authorization': `Token ${this.apiKey}`,
          'Content-Type': 'text/plain',
        },
        body: options.text,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TTSError(
          errorData.err_msg || `Deepgram API error: ${response.status}`,
          'deepgram',
          errorData.err_code,
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
        'deepgram'
      );
    }
  }

  async getVoices(): Promise<Voice[]> {
    // Deepgram voices are static, no API call needed
    return DEEPGRAM_VOICES.map((voice) => ({
      id: voice.id,
      name: voice.name,
      provider: 'deepgram' as TTSProviderType,
      language: 'en',
      gender: voice.gender,
      tags: ['aura', 'fast'],
    }));
  }

  estimateCost(charCount: number): number {
    // Deepgram Aura pricing:
    // Pay-as-you-go: $0.0135 / 1k chars = $0.0000135/char
    // Very affordable compared to others
    return charCount * 0.0000135;
  }
}
