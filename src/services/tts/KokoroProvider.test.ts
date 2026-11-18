import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { KokoroProvider } from './KokoroProvider';

// Mock the kokoro-js module
vi.mock('kokoro-js', () => ({
  KokoroTTS: {
    from_pretrained: vi.fn(),
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('KokoroProvider', () => {
  let provider: KokoroProvider;

  beforeEach(() => {
    provider = new KokoroProvider();
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('kokoro');
    expect(provider.providerName).toBe('Kokoro TTS (High Quality)');
    expect(provider.supportsWordTiming).toBe(false);
    // Below kokoro-js's 510-token truncation, so Full Audio chunks are not cut short.
    expect(provider.maxChunkLength).toBe(300);
    expect(provider.supportsStreaming).toBe(false);
  });

  it('should return zero cost (free browser TTS)', () => {
    expect(provider.estimateCost(1000)).toBe(0);
    expect(provider.estimateCost(1000000)).toBe(0);
  });

  it('should report correct download size', () => {
    expect(provider.getDownloadSize()).toBe(93 * 1000 * 1000);
  });

  it('should have static VOICES list', async () => {
    const voices = await provider.getVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'kokoro');
  });

  it('should include American and British voices', async () => {
    const voices = await provider.getVoices();
    const american = voices.filter((v) => v.language === 'en-US');
    const british = voices.filter((v) => v.language === 'en-GB');
    expect(american.length).toBeGreaterThan(0);
    expect(british.length).toBeGreaterThan(0);
  });

  it('should include both male and female voices', async () => {
    const voices = await provider.getVoices();
    const male = voices.filter((v) => v.gender === 'male');
    const female = voices.filter((v) => v.gender === 'female');
    expect(male.length).toBeGreaterThan(0);
    expect(female.length).toBeGreaterThan(0);
  });

  it('should not be ready before download', async () => {
    // When supported but not downloaded
    const hasWASM = typeof WebAssembly !== 'undefined';
    if (hasWASM) {
      expect(await provider.isReady()).toBe(false);
    }
  });

  it('should support WASM environment', () => {
    // In Node.js test environment, WebAssembly is available
    expect(provider.isSupported()).toBe(true);
  });

  it('should be configured when supported', () => {
    expect(provider.isConfigured()).toBe(provider.isSupported());
  });

  it('should have correct static model constants', () => {
    expect(KokoroProvider.MODEL_SIZE).toBe(93 * 1000 * 1000);
    expect(KokoroProvider.SAMPLE_RATE).toBe(24000);
  });

  it('should dispose instance', () => {
    provider.dispose();
    // After dispose, should be "not ready" again
    expect(provider.isSupported()).toBe(true); // still supported
  });
});
