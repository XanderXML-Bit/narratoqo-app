import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeepgramProvider } from './DeepgramProvider';
import { TTSError } from './TTSProvider';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('DeepgramProvider - synthesize', () => {
  const apiKey = 'dg-test-key';
  let provider: DeepgramProvider;

  beforeEach(() => {
    provider = new DeepgramProvider(apiKey);
  });

  it('should throw TTSError when not configured', async () => {
    const emptyProvider = new DeepgramProvider('');

    await expect(
      emptyProvider.synthesize({ text: 'Hello', voiceId: 'aura-asteria-en' })
    ).rejects.toThrow(TTSError);
  });

  it('should make correct API call with Token auth', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mp3' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hello world',
      voiceId: 'aura-luna-en',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('api.deepgram.com/v1/speak'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'Authorization': `Token ${apiKey}`,
          'Content-Type': 'text/plain',
        }),
        body: 'Hello world',
      })
    );

    // URL should contain model parameter
    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('model=aura-luna-en');

    expect(result).toHaveProperty('audioBlob');
    expect(result).toHaveProperty('audioUrl');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('timing');
  });

  it('should use default voice when not specified', async () => {
    const mockBlob = new Blob(['audio'], { type: 'audio/mp3' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await provider.synthesize({ text: 'Hello' });

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    expect(fetchUrl).toContain('model=aura-asteria-en');
  });

  it('should handle API errors', async () => {
    const mockResponse = {
      ok: false,
      status: 403,
      json: vi.fn().mockResolvedValue({
        err_msg: 'Insufficient credits',
        err_code: 'INSUFFICIENT_CREDITS',
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 'aura-asteria-en' })
    ).rejects.toThrow('Insufficient credits');
  });

  it('should handle network errors', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Connection refused'));

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 'aura-asteria-en' })
    ).rejects.toThrow('Connection refused');
  });

  it('should include estimated timing in result', async () => {
    const mockBlob = new Blob(['audio-data-here'], { type: 'audio/mp3' });
    const mockResponse = {
      ok: true,
      blob: vi.fn().mockResolvedValue(mockBlob),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hello world test',
      voiceId: 'aura-asteria-en',
    });

    // Timing should be estimated (not from API)
    expect(result.timing).toBeDefined();
    expect(result.timing!.length).toBeGreaterThan(0);
  });
});
