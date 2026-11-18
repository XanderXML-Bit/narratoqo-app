import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WebSpeechProvider } from './WebSpeechProvider';

// Mock SpeechSynthesis API
const mockGetVoices = vi.fn<() => SpeechSynthesisVoice[]>();
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockPause = vi.fn();
const mockResume = vi.fn();
const mockAddEventListener = vi.fn();
const mockRemoveEventListener = vi.fn();

function makeMockVoice(overrides: Partial<SpeechSynthesisVoice> = {}): SpeechSynthesisVoice {
  return {
    voiceURI: 'com.apple.speech.synthesis.voice.samantha',
    name: 'Samantha',
    lang: 'en-US',
    localService: true,
    default: false,
    ...overrides,
  } as SpeechSynthesisVoice;
}

function setupSpeechSynthesis(voices: SpeechSynthesisVoice[] = []) {
  mockGetVoices.mockReturnValue(voices);

  Object.defineProperty(window, 'speechSynthesis', {
    value: {
      getVoices: mockGetVoices,
      speak: mockSpeak,
      cancel: mockCancel,
      pause: mockPause,
      resume: mockResume,
      addEventListener: mockAddEventListener,
      removeEventListener: mockRemoveEventListener,
    },
    writable: true,
    configurable: true,
  });
}

const defaultVoices = [
  makeMockVoice({ voiceURI: 'voice-1', name: 'Samantha', lang: 'en-US' }),
  makeMockVoice({ voiceURI: 'voice-2', name: 'Daniel', lang: 'en-GB' }),
  makeMockVoice({ voiceURI: 'voice-3', name: 'Google Voice', lang: 'en-US' }),
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
  setupSpeechSynthesis(defaultVoices);

  // Mock SpeechSynthesisUtterance as a class
  class MockUtterance {
    voice: SpeechSynthesisVoice | null = null;
    rate = 1;
    text: string;
    onboundary: ((event: SpeechSynthesisEvent) => void) | null = null;
    onstart: (() => void) | null = null;
    onend: (() => void) | null = null;
    onerror: ((event: SpeechSynthesisErrorEvent) => void) | null = null;
    constructor(text: string) {
      this.text = text;
    }
  }

  Object.defineProperty(window, 'SpeechSynthesisUtterance', {
    value: MockUtterance,
    writable: true,
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('WebSpeechProvider', () => {
  let provider: WebSpeechProvider;

  beforeEach(() => {
    provider = new WebSpeechProvider();
  });

  it('should have correct provider properties', () => {
    expect(provider.providerType).toBe('webspeech');
    expect(provider.providerName).toBe('Browser (Built-in)');
    expect(provider.supportsWordTiming).toBe(true);
    expect(provider.maxChunkLength).toBe(32000);
    expect(provider.supportsStreaming).toBe(false);
  });

  it('should detect support when speechSynthesis exists', () => {
    expect(provider.isSupported()).toBe(true);
  });

  it('should be configured when supported', () => {
    expect(provider.isConfigured()).toBe(true);
  });

  it('should return zero cost (free)', () => {
    expect(provider.estimateCost(1000)).toBe(0);
    expect(provider.estimateCost(1000000)).toBe(0);
  });

  it('should return zero download size', () => {
    expect(provider.getDownloadSize()).toBe(0);
  });

  it('should report as ready when supported', async () => {
    expect(await provider.isReady()).toBe(true);
  });

  it('should resolve download immediately', async () => {
    await expect(provider.download()).resolves.toBeUndefined();
  });

  describe('getVoices', () => {
    it('should return mapped voices from speech synthesis', async () => {
      const voices = await provider.getVoices();

      expect(voices.length).toBe(3);
      expect(voices[0]).toMatchObject({
        id: 'voice-1',
        name: 'Samantha',
        provider: 'webspeech',
        language: 'en-US',
      });
    });

    it('should infer female gender from names', async () => {
      const voices = await provider.getVoices();
      const samantha = voices.find((v) => v.name === 'Samantha');
      expect(samantha?.gender).toBe('female');
    });

    it('should infer male gender from names', async () => {
      const voices = await provider.getVoices();
      const daniel = voices.find((v) => v.name === 'Daniel');
      expect(daniel?.gender).toBe('male');
    });

    it('should default to neutral gender for unknown names', async () => {
      const voices = await provider.getVoices();
      const google = voices.find((v) => v.name === 'Google Voice');
      expect(google?.gender).toBe('neutral');
    });
  });

  describe('stop/pause/resume', () => {
    it('should call speechSynthesis.cancel on stop', () => {
      provider.stop();
      expect(mockCancel).toHaveBeenCalled();
    });

    it('should call speechSynthesis.pause on pause', () => {
      provider.pause();
      expect(mockPause).toHaveBeenCalled();
    });

    it('should call speechSynthesis.resume on resume', () => {
      provider.resume();
      expect(mockResume).toHaveBeenCalled();
    });
  });

  describe('synthesize', () => {
    it('should call speechSynthesis.speak with utterance', async () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0) // onstart
        .mockReturnValueOnce(1000); // onend

      // Mock speak to trigger onstart/onend on the utterance
      mockSpeak.mockImplementation((utterance: { onstart?: () => void; onend?: () => void }) => {
        utterance.onstart?.();
        utterance.onend?.();
      });

      const result = await provider.synthesize({
        text: 'Hello world',
        voiceId: 'voice-1',
      });

      expect(mockSpeak).toHaveBeenCalled();
      expect(result).toHaveProperty('audioBlob');
      expect(result).toHaveProperty('audioUrl');
      expect(result).toHaveProperty('duration');
      expect(result).toHaveProperty('timing');
      expect(result.duration).toBe(1); // 1000ms / 1000 = 1s
    });

    it('should use estimated timing when no boundary events fire', async () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2000);

      mockSpeak.mockImplementation((utterance: { onstart?: () => void; onend?: () => void }) => {
        utterance.onstart?.();
        utterance.onend?.();
      });

      const result = await provider.synthesize({
        text: 'Hello world',
        voiceId: 'voice-1',
      });

      expect(result.timing).toBeDefined();
      expect(result.timing!.length).toBeGreaterThan(0);
    });

    it('should handle speech synthesis errors', async () => {
      mockSpeak.mockImplementation((utterance: { onerror?: (e: { error: string }) => void }) => {
        utterance.onerror?.({ error: 'synthesis-failed' });
      });

      await expect(
        provider.synthesize({ text: 'Hello', voiceId: 'voice-1' })
      ).rejects.toThrow('Speech synthesis failed: synthesis-failed');
    });

    it('should create a WAV audio blob', async () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(500);

      mockSpeak.mockImplementation((utterance: { onstart?: () => void; onend?: () => void }) => {
        utterance.onstart?.();
        utterance.onend?.();
      });

      const result = await provider.synthesize({
        text: 'Test',
        voiceId: 'voice-1',
      });

      expect(result.audioBlob.type).toBe('audio/wav');
      expect(result.audioBlob.size).toBeGreaterThan(44); // WAV header is 44 bytes
    });

    it('should fall back to first voice when requested voice not found', async () => {
      vi.spyOn(performance, 'now')
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(500);

      mockSpeak.mockImplementation((utterance: { onstart?: () => void; onend?: () => void }) => {
        utterance.onstart?.();
        utterance.onend?.();
      });

      const result = await provider.synthesize({
        text: 'Test',
        voiceId: 'non-existent-voice',
      });

      expect(result).toHaveProperty('audioBlob');
    });
  });

  describe('speak', () => {
    it('should speak text with specified voice', async () => {
      mockSpeak.mockImplementation((utterance: { onend?: () => void }) => {
        utterance.onend?.();
      });

      await provider.speak('Hello', 'voice-1');
      expect(mockSpeak).toHaveBeenCalled();
    });

    it('should handle speak errors', async () => {
      mockSpeak.mockImplementation((utterance: { onerror?: (e: { error: string }) => void }) => {
        utterance.onerror?.({ error: 'network' });
      });

      await expect(
        provider.speak('Hello', 'voice-1')
      ).rejects.toThrow('Speech failed: network');
    });
  });
});
