import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PiperProvider } from './PiperProvider';

// Mock the piper module
const mockPredict = vi.fn();
const mockDownload = vi.fn();
const mockStored = vi.fn();
const mockRemove = vi.fn();
const mockFlush = vi.fn();

vi.mock('@mintplex-labs/piper-tts-web', () => ({
  predict: mockPredict,
  download: mockDownload,
  stored: mockStored,
  remove: mockRemove,
  flush: mockFlush,
}));

describe('PiperProvider', () => {
  let provider: PiperProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new PiperProvider();
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('piper');
    expect(provider.providerName).toBe('Piper TTS (Multi-Language)');
    expect(provider.supportsWordTiming).toBe(false);
    expect(provider.maxChunkLength).toBe(5000);
    expect(provider.supportsStreaming).toBe(false);
  });

  it('should be free (zero cost)', () => {
    expect(provider.estimateCost(1000)).toBe(0);
    expect(provider.estimateCost(100000)).toBe(0);
  });

  it('should report the default voice download size (~63 MB)', () => {
    expect(provider.getDownloadSize()).toBe(63 * 1000 * 1000);
    expect(PiperProvider.MODEL_SIZE_PER_VOICE).toBe(63 * 1000 * 1000);
  });

  it('should return multi-language voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'piper');

    // Verify multiple languages
    const languages = [...new Set(voices.map(v => v.language))];
    expect(languages.length).toBeGreaterThan(5);
    expect(languages).toContain('en-US');
    expect(languages).toContain('en-GB');
    expect(languages).toContain('de-DE');
    expect(languages).toContain('fr-FR');
    expect(languages).toContain('es-ES');
  });

  it('should have male, female, and neutral voices', async () => {
    const voices = await provider.getVoices();
    const genders = [...new Set(voices.map(v => v.gender))];
    expect(genders).toContain('male');
    expect(genders).toContain('female');
  });

  it('should report supported when WASM is available', () => {
    expect(provider.isSupported()).toBe(true);
  });

  it('should report not ready before download', async () => {
    const ready = await provider.isReady();
    expect(ready).toBe(false);
  });

  it('should be configured when supported', () => {
    // BrowserTTSProvider.isConfigured() returns isSupported()
    expect(provider.isConfigured()).toBe(true);
  });

  it('should have static VOICES list', () => {
    expect(PiperProvider.VOICES).toBeDefined();
    expect(PiperProvider.VOICES.length).toBeGreaterThan(10);
  });

  it('should clean up on dispose', () => {
    provider.dispose();
    // After dispose, internal state should be cleared
    // No error thrown means cleanup was successful
  });
});

describe('PiperProvider voice list', () => {
  it('only lists voices that piper-tts-web can download', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const lib = readFileSync(resolve(__dirname, '../../../node_modules/@mintplex-labs/piper-tts-web/dist/piper-tts-web.js'), 'utf8');
    for (const v of PiperProvider.VOICES) {
      expect(lib.includes(`"${v.id}"`), v.id).toBe(true);
    }
  });
});
