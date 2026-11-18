import { describe, it, expect, vi } from 'vitest';
import { generateFullAudio, estimateFullAudioGenerationTime } from './FullAudioGenerator';
import type { TTSProvider } from '@/services/tts/TTSProvider';

function createMockProvider(overrides?: Partial<TTSProvider>): TTSProvider {
  return {
    name: 'mock',
    maxChunkLength: 500,
    synthesize: vi.fn().mockResolvedValue({
      audioData: new ArrayBuffer(100),
      duration: 5.0,
      format: 'mp3',
    }),
    getVoices: vi.fn().mockResolvedValue([]),
    ...overrides,
  } as unknown as TTSProvider;
}

describe('generateFullAudio', () => {
  it('generates audio for short text', async () => {
    const provider = createMockProvider();
    const result = await generateFullAudio({
      projectId: 'test-project',
      text: 'Hello world. This is a test.',
      provider,
      voiceId: 'voice-1',
    });

    expect(result.chunks.length).toBeGreaterThan(0);
    expect(result.totalDuration).toBeGreaterThan(0);
    expect(result.timingMap.projectId).toBe('test-project');
    expect(result.timingMap.segments.length).toBe(result.chunks.length);
    expect(provider.synthesize).toHaveBeenCalled();
  });

  it('reports progress correctly', async () => {
    const provider = createMockProvider();
    const progressUpdates: string[] = [];

    await generateFullAudio({
      projectId: 'test-project',
      text: 'Hello world. This is a test.',
      provider,
      voiceId: 'voice-1',
      onProgress: (p) => progressUpdates.push(p.phase),
    });

    expect(progressUpdates).toContain('chunking');
    expect(progressUpdates).toContain('generating');
    expect(progressUpdates).toContain('concatenating');
    expect(progressUpdates).toContain('complete');
  });

  it('throws on empty text', async () => {
    const provider = createMockProvider();

    await expect(
      generateFullAudio({
        projectId: 'test-project',
        text: '   ',
        provider,
        voiceId: 'voice-1',
      })
    ).rejects.toThrow();
  });

  it('accumulates duration across chunks', async () => {
    const provider = createMockProvider({
      maxChunkLength: 30,
      synthesize: vi.fn().mockResolvedValue({
        audioData: new ArrayBuffer(100),
        duration: 2.0,
        format: 'mp3',
      }),
    } as unknown as Partial<TTSProvider>);

    const text = 'First sentence here. Second sentence here. Third sentence here.';
    const result = await generateFullAudio({
      projectId: 'test-project',
      text,
      provider,
      voiceId: 'voice-1',
    });

    // Each chunk is 2s, total should be chunks * 2
    expect(result.totalDuration).toBe(result.chunks.length * 2);
  });

  it('builds timing map with correct global offsets', async () => {
    const provider = createMockProvider({
      maxChunkLength: 30,
      synthesize: vi.fn().mockImplementation(() => {
        return Promise.resolve({
          audioData: new ArrayBuffer(100),
          duration: 3.0,
          format: 'mp3',
          timing: [
            { word: 'word', startTime: 0, endTime: 1.0, charStart: 0, charEnd: 4 },
          ],
        });
      }),
    } as unknown as Partial<TTSProvider>);

    const result = await generateFullAudio({
      projectId: 'test-project',
      text: 'First sentence here. Second sentence here.',
      provider,
      voiceId: 'voice-1',
    });

    // Second segment should have globalStartTime offset by first segment's duration
    if (result.timingMap.segments.length > 1) {
      expect(result.timingMap.segments[1].globalStartTime).toBe(3.0);
    }
  });

  it('respects AbortSignal cancellation', async () => {
    let callCount = 0;
    const provider = createMockProvider({
      maxChunkLength: 30,
      synthesize: vi.fn().mockImplementation(() => {
        callCount++;
        return Promise.resolve({
          audioData: new ArrayBuffer(100),
          duration: 2.0,
          format: 'mp3',
        });
      }),
    } as unknown as Partial<TTSProvider>);

    const controller = new AbortController();
    // Abort after first chunk completes
    const originalSynthesize = provider.synthesize as ReturnType<typeof vi.fn>;
    originalSynthesize.mockImplementation(() => {
      if (callCount >= 1) {
        controller.abort();
      }
      callCount++;
      return Promise.resolve({
        audioData: new ArrayBuffer(100),
        duration: 2.0,
        format: 'mp3',
      });
    });

    const text = 'First sentence here. Second sentence here. Third sentence here.';
    await expect(
      generateFullAudio({
        projectId: 'test-project',
        text,
        provider,
        voiceId: 'voice-1',
        signal: controller.signal,
      })
    ).rejects.toThrow('cancelled');
  });

  it('uses provider timing when available', async () => {
    const provider = createMockProvider({
      synthesize: vi.fn().mockResolvedValue({
        audioData: new ArrayBuffer(100),
        duration: 5.0,
        format: 'mp3',
        timing: [
          { word: 'Hello', startTime: 0, endTime: 0.5, charStart: 0, charEnd: 5 },
          { word: 'world', startTime: 0.5, endTime: 1.0, charStart: 6, charEnd: 11 },
        ],
      }),
    } as unknown as Partial<TTSProvider>);

    const result = await generateFullAudio({
      projectId: 'test-project',
      text: 'Hello world.',
      provider,
      voiceId: 'voice-1',
    });

    const words = result.timingMap.segments[0].words;
    expect(words[0].word).toBe('Hello');
    expect(words[1].word).toBe('world');
  });

  it('maps provider timing without character offsets to distinct source words', async () => {
    const provider = createMockProvider({
      synthesize: vi.fn().mockResolvedValue({
        audioBlob: new Blob(['audio']), audioUrl: 'blob:mock-audio', duration: 1,
        timing: [
          { word: 'Hello', startTime: 0, endTime: 0.5 },
          { word: 'world', startTime: 0.5, endTime: 1 },
        ],
      }),
    });
    const result = await generateFullAudio({
      projectId: 'project', text: 'Hello  world.', provider, voiceId: 'voice',
    });
    expect(result.timingMap.segments[0].words).toEqual([
      { word: 'Hello', globalStart: 0, globalEnd: 0.5, charStart: 0, charEnd: 5 },
      { word: 'world', globalStart: 0.5, globalEnd: 1, charStart: 7, charEnd: 12 },
    ]);
  });

  it('keeps highlights in original text across normalized chunk whitespace and global time boundaries', async () => {
    const text = '  First words.\r\n\r\n\r\nSecond words.  ';
    const provider = createMockProvider({
      maxChunkLength: 18,
      synthesize: vi.fn().mockImplementation(async ({ text }) => ({
        audioBlob: new Blob(['audio']), audioUrl: 'blob:mock-audio', duration: 1,
        timing: text.split(/\s+/).map((word: string, index: number) => ({
          word, startTime: index * 0.5, endTime: (index + 1) * 0.5,
        })),
      })),
    });
    const result = await generateFullAudio({ projectId: 'project', text, provider, voiceId: 'voice' });
    expect(result.chunks).toHaveLength(2);
    expect(result.timingMap.segments.map(segment => [segment.globalStartTime, segment.globalEndTime]))
      .toEqual([[0, 1], [1, 2]]);
    const words = result.timingMap.segments.flatMap(segment => segment.words);
    expect(words.map(word => word.charStart))
      .toEqual([text.indexOf('First'), text.indexOf('words.'), text.indexOf('Second'), text.lastIndexOf('words.')]);
    words.forEach(word => {
      expect(text.slice(word.charStart, word.charEnd)).toBe(word.word);
    });
  });
});

describe('estimateFullAudioGenerationTime', () => {
  it('estimates time based on chunk count', () => {
    const result = estimateFullAudioGenerationTime('Short text.', 5000);
    expect(result.chunks).toBeGreaterThan(0);
    expect(result.estimatedSeconds).toBe(result.chunks * 3);
  });

  it('uses custom avg seconds per chunk', () => {
    const result = estimateFullAudioGenerationTime('Short text.', 5000, 5);
    expect(result.estimatedSeconds).toBe(result.chunks * 5);
  });

  it('produces more chunks for longer text', () => {
    const shortResult = estimateFullAudioGenerationTime('Short.', 50);
    const longText = 'This is a longer sentence. '.repeat(20);
    const longResult = estimateFullAudioGenerationTime(longText, 50);
    expect(longResult.chunks).toBeGreaterThanOrEqual(shortResult.chunks);
  });
});
