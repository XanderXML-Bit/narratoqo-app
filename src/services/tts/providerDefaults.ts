import type { TTSProviderType } from '@/types';

/** Providers that run in the browser with no API key and no cost. */
export const LOCAL_PROVIDERS: TTSProviderType[] = ['kokoro', 'piper', 'webspeech'];

/** Free on-device fallback order: best quality first. */
export const FREE_PROVIDER_ORDER: TTSProviderType[] = ['kokoro', 'piper', 'webspeech'];

/** Default voice for each provider when the user has not picked one. */
export const DEFAULT_VOICE_BY_PROVIDER: Record<TTSProviderType, string> = {
  kokoro: 'af_heart',
  piper: 'en_US-hfc_female-medium',
  webspeech: '',
  openai: 'alloy',
  gemini: 'Kore',
  elevenlabs: '21m00Tcm4TlvDq8ikWAM',
  playht: '',
  deepgram: 'aura-asteria-en',
};

export const PROVIDER_LABELS: Record<TTSProviderType, string> = {
  kokoro: 'Kokoro (on-device)',
  piper: 'Piper (on-device)',
  webspeech: 'Browser voice',
  openai: 'OpenAI',
  gemini: 'Gemini',
  elevenlabs: 'ElevenLabs',
  playht: 'PlayHT',
  deepgram: 'Deepgram',
};

export function isLocalProvider(provider: TTSProviderType): boolean {
  return LOCAL_PROVIDERS.includes(provider);
}

/**
 * If the saved provider cannot run (for example a cloud provider whose key
 * was cleared when the browser session ended), pick the best free
 * on-device provider and its default voice. Returns null when no change
 * is needed.
 */
export function pickFallbackProvider(
  current: TTSProviderType,
  isAvailable: (p: TTSProviderType) => boolean,
): { provider: TTSProviderType; voiceId: string } | null {
  if (isAvailable(current)) return null;
  const provider = FREE_PROVIDER_ORDER.find(isAvailable);
  if (!provider) return null;
  return { provider, voiceId: DEFAULT_VOICE_BY_PROVIDER[provider] };
}
