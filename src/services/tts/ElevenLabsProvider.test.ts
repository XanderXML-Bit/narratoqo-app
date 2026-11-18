import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ElevenLabsProvider } from './ElevenLabsProvider';
import { TTSError } from './TTSProvider';

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ElevenLabsProvider - synthesize', () => {
  const apiKey = 'xi-test-key';
  let provider: ElevenLabsProvider;

  beforeEach(() => {
    provider = new ElevenLabsProvider(apiKey);
  });

  it('should throw TTSError when not configured', async () => {
    const emptyProvider = new ElevenLabsProvider('');

    await expect(
      emptyProvider.synthesize({ text: 'Hello', voiceId: 'test-voice' })
    ).rejects.toThrow(TTSError);
  });

  it('should call the with-timestamps endpoint', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        audio_base64: btoa('fake-audio-data'),
        alignment: {
          characters: ['H', 'i'],
          character_start_times_seconds: [0, 0.1],
          character_end_times_seconds: [0.1, 0.2],
        },
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hi',
      voiceId: 'test-voice-id',
    });

    expect(globalThis.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/text-to-speech/test-voice-id/with-timestamps'),
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
        }),
      })
    );

    expect(result).toHaveProperty('audioBlob');
    expect(result).toHaveProperty('audioUrl');
    expect(result).toHaveProperty('duration');
    expect(result).toHaveProperty('timing');
  });

  it('should parse character timing into word timing', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        audio_base64: btoa('fake-audio'),
        alignment: {
          characters: ['H', 'e', 'l', 'l', 'o', ' ', 'w', 'o', 'r', 'l', 'd'],
          character_start_times_seconds: [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5],
          character_end_times_seconds: [0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55],
        },
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const result = await provider.synthesize({
      text: 'Hello world',
      voiceId: 'test-voice',
    });

    expect(result.timing).toBeDefined();
    expect(result.timing!.length).toBe(2); // "Hello" and "world"
    expect(result.timing![0].word).toBe('Hello');
    expect(result.timing![1].word).toBe('world');
    expect(result.timing![0].startTime).toBe(0);
    expect(result.timing![1].startTime).toBe(0.3);
  });

  it('should handle API error responses', async () => {
    const mockResponse = {
      ok: false,
      status: 401,
      json: vi.fn().mockResolvedValue({
        detail: { message: 'Invalid API key', status: 'unauthorized' },
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 'test' })
    ).rejects.toThrow('Invalid API key');
  });

  it('should handle network errors', async () => {
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network failure'));

    await expect(
      provider.synthesize({ text: 'Hello', voiceId: 'test' })
    ).rejects.toThrow('Network failure');
  });

  it('should use default voice when no voiceId provided', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        audio_base64: btoa('audio'),
        alignment: { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] },
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await provider.synthesize({ text: 'Hello' });

    const fetchUrl = vi.mocked(globalThis.fetch).mock.calls[0][0] as string;
    // Should use first default voice ID (Adam: pNInz6obpgDQGcFmaJgB)
    expect(fetchUrl).toContain('pNInz6obpgDQGcFmaJgB');
  });

  it('should send correct model in request body', async () => {
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        audio_base64: btoa('audio'),
        alignment: { characters: [], character_start_times_seconds: [], character_end_times_seconds: [] },
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    await provider.synthesize({ text: 'Hello', voiceId: 'test' });

    const body = JSON.parse(vi.mocked(globalThis.fetch).mock.calls[0][1]?.body as string);
    expect(body.model_id).toBe('eleven_multilingual_v2');
    expect(body.voice_settings).toHaveProperty('stability');
    expect(body.voice_settings).toHaveProperty('similarity_boost');
  });
});

describe('ElevenLabsProvider - getVoices', () => {
  it('should return default voices when not configured', async () => {
    const provider = new ElevenLabsProvider('');
    const voices = await provider.getVoices();

    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0]).toHaveProperty('provider', 'elevenlabs');
  });

  it('should fetch voices from API when configured', async () => {
    const provider = new ElevenLabsProvider('xi-test-key');
    const mockResponse = {
      ok: true,
      json: vi.fn().mockResolvedValue({
        voices: [
          { voice_id: 'v1', name: 'Voice 1', labels: { gender: 'Female', accent: 'American' }, preview_url: 'http://preview' },
          { voice_id: 'v2', name: 'Voice 2', labels: { gender: 'Male' } },
        ],
      }),
    };
    vi.mocked(globalThis.fetch).mockResolvedValue(mockResponse as unknown as Response);

    const voices = await provider.getVoices();

    expect(voices.length).toBe(2);
    expect(voices[0].id).toBe('v1');
    expect(voices[0].name).toBe('Voice 1');
    expect(voices[0].gender).toBe('female');
    expect(voices[0].previewUrl).toBe('http://preview');
    expect(voices[0].tags).toContain('American');
  });

  it('should fall back to default voices on API error', async () => {
    const provider = new ElevenLabsProvider('xi-test-key');
    vi.mocked(globalThis.fetch).mockRejectedValue(new Error('Network error'));

    const voices = await provider.getVoices();
    expect(voices.length).toBeGreaterThan(0);
    expect(voices[0].provider).toBe('elevenlabs');
  });
});
