import { describe, it, expect } from 'vitest';
import { pickFallbackProvider, isLocalProvider, DEFAULT_VOICE_BY_PROVIDER } from './providerDefaults';
import { KokoroProvider } from './KokoroProvider';
import type { TTSProviderType } from '@/types';

const available = (...ps: TTSProviderType[]) => (p: TTSProviderType) => ps.includes(p);

describe('pickFallbackProvider', () => {
  it('keeps a provider that can run', () => {
    expect(pickFallbackProvider('openai', available('openai', 'kokoro'))).toBeNull();
    expect(pickFallbackProvider('kokoro', available('kokoro'))).toBeNull();
  });

  it('switches a keyless cloud provider to Kokoro with a Kokoro voice', () => {
    expect(pickFallbackProvider('openai', available('kokoro', 'piper', 'webspeech'))).toEqual({
      provider: 'kokoro',
      voiceId: 'af_heart',
    });
  });

  it('falls back to Piper, then the browser voice, when WASM-only options are missing', () => {
    expect(pickFallbackProvider('elevenlabs', available('piper', 'webspeech'))?.provider).toBe('piper');
    expect(pickFallbackProvider('elevenlabs', available('webspeech'))?.provider).toBe('webspeech');
  });

  it('returns null when nothing can run', () => {
    expect(pickFallbackProvider('openai', available())).toBeNull();
  });
});

describe('provider defaults', () => {
  it('classifies local providers', () => {
    expect(isLocalProvider('kokoro')).toBe(true);
    expect(isLocalProvider('piper')).toBe(true);
    expect(isLocalProvider('webspeech')).toBe(true);
    expect(isLocalProvider('openai')).toBe(false);
  });

  it('uses a Kokoro default voice that exists in the voice list', () => {
    expect(KokoroProvider.VOICES.map((v) => v.id)).toContain(DEFAULT_VOICE_BY_PROVIDER.kokoro);
  });
});
