import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TTSError } from './TTSProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { GeminiProvider } from './GeminiProvider';
import { ElevenLabsProvider } from './ElevenLabsProvider';
import { PlayHTProvider } from './PlayHTProvider';
import { DeepgramProvider } from './DeepgramProvider';
import { TTSProviderFactory, getTTSFactory, resetTTSFactory } from './TTSProviderFactory';

// Reset mocks before each test
beforeEach(() => {
  vi.clearAllMocks();
  resetTTSFactory();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('TTSError', () => {
  it('should create error with all properties', () => {
    const error = new TTSError('Test error', 'openai', 'TEST_CODE', 400);

    expect(error.message).toBe('Test error');
    expect(error.provider).toBe('openai');
    expect(error.code).toBe('TEST_CODE');
    expect(error.statusCode).toBe(400);
    expect(error.name).toBe('TTSError');
  });

  it('should create error with minimal properties', () => {
    const error = new TTSError('Test error', 'gemini');

    expect(error.message).toBe('Test error');
    expect(error.provider).toBe('gemini');
    expect(error.code).toBeUndefined();
    expect(error.statusCode).toBeUndefined();
  });
});

describe('OpenAIProvider', () => {
  const apiKey = 'sk-test-key';
  let provider: OpenAIProvider;

  beforeEach(() => {
    provider = new OpenAIProvider(apiKey);
  });

  it('should be configured when API key is provided', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should not be configured when API key is empty', () => {
    const emptyProvider = new OpenAIProvider('');
    expect(emptyProvider.isConfigured()).toBe(false);
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('openai');
    expect(provider.providerName).toBe('OpenAI TTS');
    expect(provider.supportsWordTiming).toBe(false);
    expect(provider.maxChunkLength).toBe(4096);
    expect(provider.supportsStreaming).toBe(true);
  });

  it('should return available voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'openai');
  });

  it('should estimate cost correctly', () => {
    // tts-1-hd costs $30/1M chars = $0.00003/char
    const cost = provider.estimateCost(1000);
    expect(cost).toBeCloseTo(0.03, 5);
  });

  it('should throw error when not configured', async () => {
    const emptyProvider = new OpenAIProvider('');

    await expect(
      emptyProvider.synthesize({ text: 'Hello', voiceId: 'nova' })
    ).rejects.toThrow(TTSError);
  });

  it('should make correct API call', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hello world',
      voiceId: 'nova',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/audio/speech',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result).toHaveProperty('audioBlob');
    expect(result).toHaveProperty('audioUrl');
    expect(result).toHaveProperty('duration');
  });

  it('should handle API errors', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({ error: { message: 'Invalid API key' } }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 'nova' })
    ).rejects.toThrow('Invalid API key');
  });
});

describe('GeminiProvider', () => {
  const apiKey = 'AIza-test-key';
  let provider: GeminiProvider;

  beforeEach(() => {
    provider = new GeminiProvider(apiKey);
  });

  it('should be configured when API key is provided', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('gemini');
    expect(provider.providerName).toBe('Google Gemini TTS');
    expect(provider.supportsWordTiming).toBe(false);
    expect(provider.maxChunkLength).toBe(8000);
    expect(provider.supportsStreaming).toBe(false);
  });

  it('should return available voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'gemini');
  });

  it('should estimate cost correctly', () => {
    // Flash model: ~$0.075/1M chars = $0.000000075/char
    const cost = provider.estimateCost(1000000);
    expect(cost).toBeCloseTo(0.075, 3);
  });

  it('should throw error when not configured', async () => {
    const emptyProvider = new GeminiProvider('');

    await expect(
      emptyProvider.synthesize({ text: 'Hello', voiceId: 'Kore' })
    ).rejects.toThrow(TTSError);
  });

  it('should use camelCase API fields', async () => {
    const mockPcmData = btoa('fake-pcm-data');
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        candidates: [{
          content: {
            parts: [{
              inlineData: {
                data: mockPcmData,
                mimeType: 'audio/L16',
              },
            }],
          },
        }],
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await provider.synthesize({
      text: 'Hello world',
      voiceId: 'Kore',
    });

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse(fetchCall[1]?.body as string);

    // Verify camelCase fields are used
    expect(body.generationConfig).toHaveProperty('responseModalities');
    expect(body.generationConfig).toHaveProperty('speechConfig');
    expect(body.generationConfig.speechConfig).toHaveProperty('voiceConfig');
    expect(body.generationConfig.speechConfig.voiceConfig).toHaveProperty('prebuiltVoiceConfig');
    expect(body.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig).toHaveProperty('voiceName');
  });
});

describe('ElevenLabsProvider', () => {
  const apiKey = 'xi-test-key';
  let provider: ElevenLabsProvider;

  beforeEach(() => {
    provider = new ElevenLabsProvider(apiKey);
  });

  it('should be configured when API key is provided', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('elevenlabs');
    expect(provider.providerName).toBe('ElevenLabs');
    expect(provider.supportsWordTiming).toBe(true);
    expect(provider.maxChunkLength).toBe(5000);
    expect(provider.supportsStreaming).toBe(true);
  });

  it('should return available voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'elevenlabs');
  });

  it('should estimate cost correctly', () => {
    // ~$0.0002/char
    const cost = provider.estimateCost(10000);
    expect(cost).toBeCloseTo(2.0, 2);
  });
});

describe('DeepgramProvider', () => {
  const apiKey = 'dg-test-key';
  let provider: DeepgramProvider;

  beforeEach(() => {
    provider = new DeepgramProvider(apiKey);
  });

  it('should be configured when API key is provided', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('deepgram');
    expect(provider.providerName).toBe('Deepgram Aura');
    expect(provider.supportsWordTiming).toBe(false);
    expect(provider.maxChunkLength).toBe(2000);
    expect(provider.supportsStreaming).toBe(true);
  });

  it('should return available voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'deepgram');
    expect(voices[0].id).toMatch(/^aura-/);
  });

  it('should estimate cost correctly', () => {
    // $0.0135/1k chars = $0.0000135/char
    const cost = provider.estimateCost(100000);
    expect(cost).toBeCloseTo(1.35, 2);
  });
});

describe('PlayHTProvider', () => {
  const apiKey = 'playht-test-key';
  const userId = 'test-user-id';
  let provider: PlayHTProvider;

  beforeEach(() => {
    provider = new PlayHTProvider(apiKey, userId);
  });

  it('should be configured when API key is provided', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('playht');
    expect(provider.providerName).toBe('PlayHT');
    expect(provider.supportsWordTiming).toBe(false);
    expect(provider.maxChunkLength).toBe(3000);
    expect(provider.supportsStreaming).toBe(true);
  });

  it('should return available voices', async () => {
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('id');
    expect(voices[0]).toHaveProperty('name');
    expect(voices[0]).toHaveProperty('provider', 'playht');
  });

  it('should estimate cost correctly', () => {
    // ~$0.00017/char
    const cost = provider.estimateCost(10000);
    expect(cost).toBeCloseTo(1.7, 2);
  });

  it('should throw error when user ID is missing', async () => {
    const noUserProvider = new PlayHTProvider(apiKey, '');

    await expect(
      noUserProvider.synthesize({ text: 'Hello', voiceId: 's3://voice' })
    ).rejects.toThrow('PlayHT API key or User ID not configured');
  });
});

describe('TTSProviderFactory', () => {
  it('should create factory with providers', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      geminiApiKey: 'AIza-test',
    });

    expect(factory.getProvider('openai')).toBeDefined();
    expect(factory.getProvider('gemini')).toBeDefined();
    expect(factory.getProvider('elevenlabs')).toBeUndefined();
  });

  it('should return available providers', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      deepgramApiKey: 'dg-test',
    });

    const available = factory.getAvailableProviders();
    expect(available).toContain('openai');
    expect(available).toContain('deepgram');
    expect(available).not.toContain('elevenlabs');
  });

  it('should get best provider by priority', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      deepgramApiKey: 'dg-test',
    });

    const best = factory.getBestProvider();
    // OpenAI has higher priority than Deepgram
    expect(best?.providerType).toBe('openai');
  });

  it('should return word timing provider', () => {
    const factory = new TTSProviderFactory({
      elevenLabsApiKey: 'xi-test',
      openAiApiKey: 'sk-test',
    });

    const timingProvider = factory.getWordTimingProvider();
    expect(timingProvider?.providerType).toBe('elevenlabs');
  });

  it('should estimate costs for all providers', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
      geminiApiKey: 'AIza-test',
    });

    const costs = factory.estimateCosts('Hello world');
    expect(costs.openai).toBeGreaterThan(0);
    expect(costs.gemini).toBeGreaterThan(0);
    expect(costs.elevenlabs).toBe(0); // Not configured
  });

  it('should update config and reinitialize', () => {
    const factory = new TTSProviderFactory({
      openAiApiKey: 'sk-test',
    });

    expect(factory.getProvider('gemini')).toBeUndefined();

    factory.updateConfig({ geminiApiKey: 'AIza-test' });

    expect(factory.getProvider('gemini')).toBeDefined();
  });
});

describe('getTTSFactory', () => {
  beforeEach(() => {
    resetTTSFactory();
  });

  it('should create singleton factory', () => {
    const factory1 = getTTSFactory({ openAiApiKey: 'sk-test' });
    const factory2 = getTTSFactory();

    expect(factory1).toBe(factory2);
  });

  it('should update existing factory with new config', () => {
    const factory = getTTSFactory({ openAiApiKey: 'sk-test' });
    expect(factory.getProvider('gemini')).toBeUndefined();

    getTTSFactory({ geminiApiKey: 'AIza-test' });
    expect(factory.getProvider('gemini')).toBeDefined();
  });
});
