import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock all provider modules before importing factory
vi.mock('./OpenAIProvider', () => ({
  OpenAIProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([{ id: 'alloy', name: 'Alloy', provider: 'openai' }]);
    estimateCost = (chars: number) => chars * 0.000015;
  },
}));
vi.mock('./ElevenLabsProvider', () => ({
  ElevenLabsProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([{ id: 'rachel', name: 'Rachel', provider: 'elevenlabs' }]);
    estimateCost = (chars: number) => chars * 0.00003;
  },
}));
vi.mock('./PlayHTProvider', () => ({
  PlayHTProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0.01;
  },
}));
vi.mock('./DeepgramProvider', () => ({
  DeepgramProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0.005;
  },
}));
vi.mock('./GeminiProvider', () => ({
  GeminiProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0;
  },
}));
vi.mock('./WebSpeechProvider', () => ({
  WebSpeechProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0;
  },
}));
vi.mock('./KokoroProvider', () => ({
  KokoroProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0;
  },
}));
vi.mock('./PiperProvider', () => ({
  PiperProvider: class {
    isConfigured = () => true;
    isSupported = () => true;
    getVoices = vi.fn().mockResolvedValue([]);
    estimateCost = () => 0;
  },
}));

import { TTSProviderFactory, getTTSFactory, resetTTSFactory } from './TTSProviderFactory';

describe('TTSProviderFactory', () => {
  beforeEach(() => {
    resetTTSFactory();
  });

  it('should create providers based on config', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      elevenLabsApiKey: 'el-test',
    });

    expect(factory.getProvider('openai')).toBeDefined();
    expect(factory.getProvider('elevenlabs')).toBeDefined();
    // Browser providers always available (mocked as supported)
    expect(factory.getProvider('webspeech')).toBeDefined();
    expect(factory.getProvider('kokoro')).toBeDefined();
    expect(factory.getProvider('piper')).toBeDefined();
  });

  it('should not create cloud providers without API keys', () => {
    const factory = new TTSProviderFactory({});
    expect(factory.getProvider('openai')).toBeUndefined();
    expect(factory.getProvider('elevenlabs')).toBeUndefined();
    expect(factory.getProvider('deepgram')).toBeUndefined();
  });

  it('should return best provider by priority', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      elevenLabsApiKey: 'el-test',
    });

    const best = factory.getBestProvider();
    expect(best).toBeDefined();
    // ElevenLabs has highest priority among configured
  });

  it('should return available providers list', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
    });

    const available = factory.getAvailableProviders();
    expect(available).toContain('openai');
    expect(available).toContain('webspeech');
  });

  it('should check provider availability', () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    expect(factory.isProviderAvailable('openai')).toBe(true);
    expect(factory.isProviderAvailable('elevenlabs')).toBe(false);
  });

  it('should get browser providers', () => {
    const factory = new TTSProviderFactory({});
    const browserProviders = factory.getBrowserProviders();
    expect(browserProviders).toContain('webspeech');
    expect(browserProviders).toContain('kokoro');
    expect(browserProviders).toContain('piper');
  });

  it('should report hasFreeProvider', () => {
    const factory = new TTSProviderFactory({});
    expect(factory.hasFreeProvider()).toBe(true);
  });

  it('should get best free provider', () => {
    const factory = new TTSProviderFactory({});
    const free = factory.getBestFreeProvider();
    expect(free).toBeDefined();
  });

  it('should cache voices', async () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    const voices1 = await factory.getVoices('openai');
    const voices2 = await factory.getVoices('openai');
    expect(voices1).toEqual(voices2);
  });

  it('should return empty voices for unknown provider', async () => {
    const factory = new TTSProviderFactory({});
    const voices = await factory.getVoices('elevenlabs');
    expect(voices).toEqual([]);
  });

  it('should clear voice cache', async () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    await factory.getVoices('openai');
    factory.clearVoiceCache();
    // Should re-fetch after clear
    const voices = await factory.getVoices('openai');
    expect(voices).toBeDefined();
  });

  it('should estimate costs', () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    const costs = factory.estimateCosts('Hello world');
    expect(costs.openai).toBeGreaterThan(0);
  });

  it('should update config and reinitialize', () => {
    const factory = new TTSProviderFactory({});
    expect(factory.getProvider('openai')).toBeUndefined();

    factory.updateConfig({ openAiApiKey: 'sk-new' });
    expect(factory.getProvider('openai')).toBeDefined();
  });

  it('keeps the loaded on-device providers when the same config is passed again', () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    const kokoro = factory.getProvider('kokoro');
    const openai = factory.getProvider('openai');
    // useTTSProvider passes the full config before every synthesis.
    factory.updateConfig({ openAiApiKey: 'sk-test' });
    expect(factory.getProvider('kokoro')).toBe(kokoro);
    expect(factory.getProvider('openai')).toBe(openai);
  });

  it('rebuilds only cloud providers when a key changes', () => {
    const factory = new TTSProviderFactory({});
    const kokoro = factory.getProvider('kokoro');
    const piper = factory.getProvider('piper');
    factory.updateConfig({ openAiApiKey: 'sk-new' });
    expect(factory.getProvider('openai')).toBeDefined();
    expect(factory.getProvider('kokoro')).toBe(kokoro);
    expect(factory.getProvider('piper')).toBe(piper);
  });

  it('should dispose all providers', () => {
    const factory = new TTSProviderFactory({ openAiApiKey: 'sk-test' });
    factory.dispose();
    expect(factory.getAvailableProviders()).toEqual([]);
  });

  describe('singleton', () => {
    it('should return same instance from getTTSFactory', () => {
      const f1 = getTTSFactory({ openAiApiKey: 'sk-test' });
      const f2 = getTTSFactory();
      expect(f1).toBe(f2);
    });

    it('should reset singleton', () => {
      const f1 = getTTSFactory({ openAiApiKey: 'sk-test' });
      resetTTSFactory();
      const f2 = getTTSFactory({});
      expect(f1).not.toBe(f2);
    });
  });
});
