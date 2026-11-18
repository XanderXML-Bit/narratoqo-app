import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PlayHTProvider } from './PlayHTProvider';
import { TTSError } from './TTSProvider';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('PlayHTProvider - synthesize', () => {
  const apiKey = 'playht-test-key';
  const userId = 'test-user-id';
  let provider: PlayHTProvider;

  beforeEach(() => {
    provider = new PlayHTProvider(apiKey, userId);
  });

  it('should throw when not configured (no API key)', async () => {
    const emptyProvider = new PlayHTProvider('', userId);

    await expect(
      emptyProvider.synthesize({ text: 'Hello', voiceId: 's3://voice' })
    ).rejects.toThrow(TTSError);
  });

  it('should throw when user ID is missing', async () => {
    const noUserProvider = new PlayHTProvider(apiKey, '');

    await expect(
      noUserProvider.synthesize({ text: 'Hello', voiceId: 's3://voice' })
    ).rejects.toThrow('PlayHT API key or User ID not configured');
  });

  it('should make correct API call with Bearer auth and X-USER-ID', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mpeg' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hello world',
      voiceId: 's3://test-voice',
      speed: 1.5,
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.play.ht/api/v2/tts'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': `Bearer ${apiKey}`,
          'X-USER-ID': userId,
          'Content-Type': 'application/json',
          'Accept': 'audio/mpeg',
        }),
      })
    );

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    expect(body.text).toBe('Hello world');
    expect(body.voice).toBe('s3://test-voice');
    expect(body.speed).toBe(1.5);
    expect(body.voice_engine).toBe('PlayHT2.0');

    expect(result).toHaveProperty('audioBlob');
    expect(result).toHaveProperty('audioUrl');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('timing');
  });

  it('should handle API errors', async () => {
    const mockResponse = {
      ok: false,
      status: 402,
      json: vi.fn().mockResolvedValue({
        error_message: 'Payment required',
        error_code: 'PAYMENT_REQUIRED',
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 's3://voice' })
    ).rejects.toThrow('Payment required');
  });

  it('should handle network errors', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Timeout'));

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 's3://voice' })
    ).rejects.toThrow('Timeout');
  });
});

describe('PlayHTProvider - getVoices', () => {
  it('should return default voices when not configured', async () => {
    const provider = new PlayHTProvider('', '');
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('provider', 'playht');
  });

  it('should fetch voices from API when configured', async () => {
    const provider = new PlayHTProvider('key', 'user-id');
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue([
        { id: 'v1', name: 'Voice A', language_code: 'en-US', gender: 'Female', sample: 'http://sample' },
        { id: 'v2', name: 'Voice B', language_code: 'es', gender: 'Male' },
      ]),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const voices = await provider.getVoices();

    expect(voices.length).toBe(2);
    expect(voices[0].id).toBe('v1');
    expect(voices[0].name).toBe('Voice A');
    expect(voices[0].gender).toBe('female');
    expect(voices[0].language).toBe('en-US');
    expect(voices[0].previewUrl).toBe('http://sample');
  });

  it('should fall back to defaults on API error', async () => {
    const provider = new PlayHTProvider('key', 'user-id');
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    const voices = await provider.getVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0].provider).toBe('playht');
  });
});
