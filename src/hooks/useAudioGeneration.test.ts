import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CachedAudio, TTSOptions, TTSProviderType, TTSResult } from '@/types';
import { useAudioGeneration } from './useAudioGeneration';
import { getAudioCacheManager, resetAudioCacheManager } from '@/services/audio/AudioCacheManager';
import { buildWordOffsetMap, findSegmentForWord } from '@/services/segmentation/SegmentTimingMapper';
import { segmentText } from '@/services/segmentation/TextSegmenter';

const mocks = vi.hoisted(() => ({
  rows: new Map<string, CachedAudio>(),
  projectState: { currentProject: { id: 'project-a' } },
  settings: { defaultProvider: 'webspeech' as TTSProviderType, defaultVoiceId: 'voice-a' },
  synthesize: vi.fn<(options: TTSOptions) => Promise<TTSResult>>(),
  getProvider: vi.fn(),
  playerActions: { setError: vi.fn() },
  uiActions: { addToast: vi.fn() },
}));

vi.mock('@/stores', () => ({
  useProjectState: () => mocks.projectState,
  useSettingsState: () => mocks.settings,
  usePlayerActions: () => mocks.playerActions,
  useUIActions: () => mocks.uiActions,
}));

// Stop at the provider interface: no provider SDK, model, or external API is loaded.
vi.mock('@/hooks/useTTSProvider', () => ({ useTTSProvider: () => mocks.getProvider }));
vi.mock('@/services/audio', async () => import('@/services/audio/AudioCacheManager'));

// A small persistence double lets the real cache manager exercise cold and warm keys.
vi.mock('@/db/schema', () => {
  const put = vi.fn(async (audio: CachedAudio) => {
    mocks.rows.set(audio.id, audio);
    return audio.id;
  });
  return {
    saveCachedAudio: put,
    db: {
      audioCache: {
        put,
        where: vi.fn((index: string) => ({
          equals: vi.fn((value: string | [string, number]) => {
            const matching = () => [...mocks.rows.values()].filter(row => (
              index === 'projectId'
                ? row.projectId === value
                : row.projectId === value[0] && row.chunkIndex === value[1]
            ));
            return {
              first: async () => matching()[0],
              toArray: async () => matching(),
              modify: async (changes: Partial<CachedAudio>) => {
                matching().forEach(row => Object.assign(row, changes));
              },
            };
          }),
        })),
      },
      transaction: async (_mode: string, _table: unknown, callback: () => Promise<void>) => callback(),
    },
  };
});

const text = '  First paragraph.\n\n\tSecond paragraph.  ';
const segments = segmentText(text, 'project-a');
const initialStatus = {};

beforeEach(() => {
  resetAudioCacheManager();
  vi.clearAllMocks();
  mocks.synthesize.mockReset();
  mocks.getProvider.mockReset();
  mocks.rows.clear();
  mocks.projectState.currentProject = { id: 'project-a' };
  mocks.settings.defaultProvider = 'webspeech';
  mocks.settings.defaultVoiceId = 'voice-a';
  mocks.getProvider.mockReturnValue({ synthesize: mocks.synthesize });
  mocks.synthesize.mockImplementation(async options => ({
    audioBlob: new Blob([options.text], { type: 'audio/wav' }),
    audioUrl: 'blob:mock-audio',
    duration: 1,
    timing: options.text.split(/\s+/).map((word, index) => ({
      word, startTime: index * 0.5, endTime: (index + 1) * 0.5,
    })),
  }));
});

afterEach(() => {
  cleanup();
  resetAudioCacheManager();
});

describe('text → segment → audio cache', () => {
  it('synthesizes segment text and persists audio and timing under the project/segment key', async () => {
    const { result } = renderHook(() => useAudioGeneration(segments, initialStatus));
    let audio: CachedAudio | undefined;
    await act(async () => { audio = await result.current.generateSegmentAudio(1); });

    expect(mocks.synthesize).toHaveBeenCalledExactlyOnceWith({
      text: 'Second paragraph.', voiceId: 'voice-a',
    });
    expect(audio).toMatchObject({
      id: 'project-a-1', projectId: 'project-a', chunkIndex: 1,
      provider: 'webspeech', voiceId: 'voice-a', sizeBytes: audio?.blob.size,
    });
    expect(mocks.rows.get('project-a-1')).toBe(audio);
    expect(result.current.segmentAudioStatus[1]).toBe('ready');

    const offsets = buildWordOffsetMap(text, audio!.timing!);
    expect(offsets[0].charStart).toBe(text.indexOf('Second'));
    expect(findSegmentForWord(0, offsets, segments)?.index).toBe(1);
  });

  it('reuses matching audio from memory and from persistence without calling the provider', async () => {
    const { result } = renderHook(() => useAudioGeneration(segments, initialStatus));
    let first: CachedAudio | undefined;
    let warm: CachedAudio | undefined;
    let cold: CachedAudio | undefined;
    await act(async () => { first = await result.current.generateSegmentAudio(0); });
    await act(async () => { warm = await result.current.generateSegmentAudio(0); });
    getAudioCacheManager().invalidate('project-a');
    await act(async () => { cold = await result.current.generateSegmentAudio(0); });
    expect(warm).toBe(first);
    expect(cold).toBe(first);
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
  });

  it('keeps separate keys for segment indexes within one project', async () => {
    const { result } = renderHook(() => useAudioGeneration(segments, initialStatus));
    await act(async () => {
      await result.current.generateSegmentAudio(0);
      await result.current.generateSegmentAudio(1);
    });
    expect([...mocks.rows.keys()]).toEqual(['project-a-0', 'project-a-1']);
    expect(mocks.rows.get('project-a-0')?.blob).not.toBe(mocks.rows.get('project-a-1')?.blob);
    expect(mocks.synthesize).toHaveBeenCalledTimes(2);
  });

  it('keeps separate keys for the same segment index in different projects', async () => {
    const first = renderHook(() => useAudioGeneration(segments, initialStatus));
    await act(async () => { await first.result.current.generateSegmentAudio(0); });
    first.unmount();
    mocks.projectState.currentProject = { id: 'project-b' };
    const second = renderHook(() => useAudioGeneration(segmentText(text, 'project-b'), initialStatus));
    await act(async () => { await second.result.current.generateSegmentAudio(0); });
    expect([...mocks.rows.keys()]).toEqual(['project-a-0', 'project-b-0']);
    expect(mocks.synthesize).toHaveBeenCalledTimes(2);
  });

  it.each(['provider', 'voice'] as const)('regenerates when the %s changes', async field => {
    const { result, rerender } = renderHook(() => useAudioGeneration(segments, initialStatus));
    await act(async () => { await result.current.generateSegmentAudio(0); });
    if (field === 'provider') mocks.settings.defaultProvider = 'piper';
    else mocks.settings.defaultVoiceId = 'voice-b';
    rerender();
    await act(async () => { await result.current.generateSegmentAudio(0); });
    expect(mocks.synthesize).toHaveBeenCalledTimes(2);
    expect(mocks.rows.get('project-a-0')).toMatchObject({
      provider: mocks.settings.defaultProvider, voiceId: mocks.settings.defaultVoiceId,
    });
  });

  it('deduplicates concurrent requests for the same segment', async () => {
    let complete!: (result: TTSResult) => void;
    mocks.synthesize.mockReturnValue(new Promise(resolve => { complete = resolve; }));
    const { result } = renderHook(() => useAudioGeneration(segments, initialStatus));
    await act(async () => {
      const first = result.current.generateSegmentAudio(0);
      const second = result.current.generateSegmentAudio(0);
      complete({ audioBlob: new Blob(['audio']), audioUrl: 'blob:mock-audio', duration: 1 });
      const [a, b] = await Promise.all([first, second]);
      expect(a).toBe(b);
    });
    expect(mocks.synthesize).toHaveBeenCalledTimes(1);
    expect(mocks.rows.size).toBe(1);
  });

  it('ignores invalid segment indexes without reading a provider or writing cache entries', async () => {
    const { result } = renderHook(() => useAudioGeneration(segments, initialStatus));
    await act(async () => {
      expect(await result.current.generateSegmentAudio(-1)).toBeUndefined();
      expect(await result.current.generateSegmentAudio(segments.length)).toBeUndefined();
    });
    expect(mocks.getProvider).not.toHaveBeenCalled();
    expect(mocks.rows.size).toBe(0);
  });
});
