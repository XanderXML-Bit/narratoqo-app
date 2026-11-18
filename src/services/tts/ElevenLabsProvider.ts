import { TTSProvider, TTSError } from './TTSProvider';
import type { TTSOptions, TTSResult, Voice, TTSProviderType, WordTiming } from '@/types';

// Popular ElevenLabs voices (more can be fetched via API)
const DEFAULT_VOICES = [
  { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', gender: 'male' as const },
  { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah', gender: 'female' as const },
  { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel', gender: 'male' as const },
  { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte', gender: 'female' as const },
  { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', gender: 'female' as const },
  { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', gender: 'female' as const },
  { id: 'MF3mGyEYCl7XYWbV9V6O', name: 'Elli', gender: 'female' as const },
  { id: 'TxGEqnHWrfWFTfGW9XjX', name: 'Josh', gender: 'male' as const },
  { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', gender: 'male' as const },
  { id: 'pqHfZKP75CvOlQylNhV4', name: 'Bill', gender: 'male' as const },
] as const;

interface ElevenLabsTTSRequest {
  text: string;
  model_id: string;
  voice_settings: {
    stability: number;
    similarity_boost: number;
    style?: number;
    use_speaker_boost?: boolean;
  };
}

interface ElevenLabsTimestampResponse {
  audio_base64: string;
  alignment: {
    characters: string[];
    character_start_times_seconds: number[];
    character_end_times_seconds: number[];
  };
}

interface ElevenLabsVoiceResponse {
  voices: Array<{
    voice_id: string;
    name: string;
    labels?: {
      gender?: string;
      age?: string;
      accent?: string;
      description?: string;
    };
    preview_url?: string;
  }>;
}

/** TTS provider for the ElevenLabs speech synthesis API with word-level timing. */
export class ElevenLabsProvider extends TTSProvider {
  readonly providerType: TTSProviderType = 'elevenlabs';
  readonly providerName = 'ElevenLabs';
  readonly supportsWordTiming = true;
  readonly maxChunkLength = 5000;
  readonly supportsStreaming = true;

  private readonly baseUrl = 'https://api.elevenlabs.io/v1';
  private readonly model: string;

  constructor(
    apiKey: string,
    options?: {
      model?: 'eleven_multilingual_v2' | 'eleven_turbo_v2' | 'eleven_monolingual_v1';
    }
  ) {
    super(apiKey);
    this.model = options?.model || 'eleven_multilingual_v2';
  }

  /** Synthesize speech using the ElevenLabs API with character-level timestamps. */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isConfigured()) {
      throw new TTSError('ElevenLabs API key not configured', 'elevenlabs', 'NOT_CONFIGURED');
    }
    this.validateText(options);

    const voiceId = options.voiceId || DEFAULT_VOICES[0].id;
    const stability = options.stability ?? 0.5;

    const requestBody: ElevenLabsTTSRequest = {
      text: options.text,
      model_id: options.modelId || this.model,
      voice_settings: {
        stability,
        similarity_boost: 0.75,
        style: 0.5,
        use_speaker_boost: true,
      },
    };

    try {
      // Use the with-timestamps endpoint to get word timing
      const response = await fetch(
        `${this.baseUrl}/text-to-speech/${voiceId}/with-timestamps`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(requestBody),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new TTSError(
          errorData.detail?.message || `ElevenLabs API error: ${response.status}`,
          'elevenlabs',
          errorData.detail?.status,
          response.status
        );
      }

      const data: ElevenLabsTimestampResponse = await response.json();

      const audioBlob = this.base64ToBlob(data.audio_base64, 'audio/mpeg');
      const audioUrl = this.createAudioUrl(audioBlob);
      const timing = this.parseCharacterTiming(
        data.alignment,
        options.text
      );
      const duration = timing.length > 0
        ? timing[timing.length - 1].endTime
        : this.estimateDuration(audioBlob);

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
        'elevenlabs'
      );
    }
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.isConfigured()) {
      // Return default voices if not configured
      return DEFAULT_VOICES.map((voice) => ({
        id: voice.id,
        name: voice.name,
        provider: 'elevenlabs' as TTSProviderType,
        language: 'en',
        gender: voice.gender,
      }));
    }

    try {
      const response = await fetch(`${this.baseUrl}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.status}`);
      }

      const data: ElevenLabsVoiceResponse = await response.json();

      return data.voices.map((voice) => ({
        id: voice.voice_id,
        name: voice.name,
        provider: 'elevenlabs' as TTSProviderType,
        language: 'en',
        gender: (voice.labels?.gender?.toLowerCase() as 'male' | 'female' | 'neutral') || 'neutral',
        previewUrl: voice.preview_url,
        tags: [
          voice.labels?.accent,
          voice.labels?.age,
          voice.labels?.description,
        ].filter(Boolean) as string[],
      }));
    } catch {
      // Return default voices on error
      return DEFAULT_VOICES.map((voice) => ({
        id: voice.id,
        name: voice.name,
        provider: 'elevenlabs' as TTSProviderType,
        language: 'en',
        gender: voice.gender,
      }));
    }
  }

  estimateCost(charCount: number): number {
    // ElevenLabs pricing varies by plan
    // Free: 10,000 chars/month
    // Starter: $5/mo for 30,000 chars ($0.000167/char)
    // Creator: $22/mo for 100,000 chars ($0.00022/char)
    // Average: ~$0.0002/char
    return charCount * 0.0002;
  }

  /**
   * Convert character-level timing to word-level timing.
   */
  private parseCharacterTiming(
    alignment: ElevenLabsTimestampResponse['alignment'],
    _originalText: string
  ): WordTiming[] {
    const wordTimings: WordTiming[] = [];

    if (!alignment.characters || alignment.characters.length === 0) {
      return wordTimings;
    }

    let currentWord = '';
    let wordStartTime = 0;
    let wordStartChar = 0;
    let charIndex = 0;

    for (let i = 0; i < alignment.characters.length; i++) {
      const char = alignment.characters[i];
      const startTime = alignment.character_start_times_seconds[i];
      const _endTime = alignment.character_end_times_seconds[i];

      if (char === ' ' || char === '\n' || char === '\t') {
        // End of word
        if (currentWord.length > 0) {
          wordTimings.push({
            word: currentWord,
            startTime: wordStartTime,
            endTime: alignment.character_end_times_seconds[i - 1],
            charStart: wordStartChar,
            charEnd: charIndex,
          });
          currentWord = '';
        }
        charIndex++;
      } else {
        // Part of a word
        if (currentWord.length === 0) {
          wordStartTime = startTime;
          wordStartChar = charIndex;
        }
        currentWord += char;
        charIndex++;
      }
    }

    // Don't forget the last word
    if (currentWord.length > 0) {
      const lastIdx = alignment.characters.length - 1;
      wordTimings.push({
        word: currentWord,
        startTime: wordStartTime,
        endTime: alignment.character_end_times_seconds[lastIdx],
        charStart: wordStartChar,
        charEnd: charIndex,
      });
    }

    return wordTimings;
  }
}
