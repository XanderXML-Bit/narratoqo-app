/**
 * Playback-queue tests for the reader (defects 1 to 3 of the 2026-11 audit).
 *
 * The real useAudioGeneration and useSegmentPlayback hooks run together. Only the
 * edges are faked: a synthesizer that takes a fixed time per segment, and an audio
 * player that "plays" a blob for its duration on fake timers and records what it played.
 */
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TTSOptions, TTSResult, WordTiming } from '@/types';
import { useAudioGeneration } from './useAudioGeneration';
import { useSegmentPlayback } from './useSegmentPlayback';
import { resetAudioCacheManager } from '@/services/audio/AudioCacheManager';
import { segmentText } from '@/services/segmentation/TextSegmenter';
import { SAMPLE_TEXT } from '@/services/sampleProject';

/** Fixed synthesis time for every segment (slow, like Kokoro on a phone CPU). */
const SYNTH_DELAY_MS = 4000;
/** Audio length per segment: the 3-word heading is short, the rest are long. */
const DURATION_S = [1, 6, 12, 16, 12];

type PlayerCallbacks = {
  onTimeUpdate?: (t: number) => void;
  onWordUpdate?: (i: number) => void;
  onPlay?: () => void;
  onPause?: () => void;
  onEnd?: () => void;
  onError?: (e: Error) => void;
};

const mocks = vi.hoisted(() => ({
  rows: new Map<string, unknown>(),
  blobSegment: new WeakMap<Blob, number>(),
  log: [] as Array<{ type: 'play' | 'end' | 'stop'; seg: number; at: number; card: number; timingFor: number }>,
  player: null as unknown,
  playerState: { isPlaying: false, currentTime: 0, totalDuration: 0, volume: 1, playbackSpeed: 1 },
  addToast: vi.fn(),
}));

class FakeAudioPlayer {
  callbacks: PlayerCallbacks = {};
  private blob: Blob | null = null;
  private position = 0;
  private startedAt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private _isPlaying = false;
  private _duration = 0;
  /** Lets the test record which card and timing were on screen at each event. */
  observe: () => { card: number; timingFor: number } = () => ({ card: -1, timingFor: -1 });

  setCallbacks(cb: PlayerCallbacks) { this.callbacks = { ...this.callbacks, ...cb }; }
  get isLoaded() { return this.blob !== null; }
  get isPlaying() { return this._isPlaying; }
  get duration() { return this._duration; }
  get currentTime() { return this.position; }
  get segment() { return this.blob ? mocks.blobSegment.get(this.blob) ?? -1 : -1; }

  async load(blob: Blob) {
    this.unload();
    this.blob = blob;
    this._duration = DURATION_S[mocks.blobSegment.get(blob) ?? 0];
    await Promise.resolve();
  }
  play() {
    if (!this.blob || this._isPlaying) return;
    if (this.position >= this._duration) this.position = 0;
    this._isPlaying = true;
    this.startedAt = Date.now();
    mocks.log.push({ type: 'play', seg: this.segment, at: Date.now(), ...this.observe() });
    this.callbacks.onPlay?.();
    this.timer = setTimeout(() => {
      this.timer = null;
      this._isPlaying = false;
      this.position = this._duration;
      mocks.log.push({ type: 'end', seg: this.segment, at: Date.now(), ...this.observe() });
      this.callbacks.onEnd?.();
    }, (this._duration - this.position) * 1000);
  }
  pause() {
    if (!this._isPlaying) return;
    this.position += (Date.now() - this.startedAt) / 1000;
    this._isPlaying = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.callbacks.onPause?.();
  }
  togglePlay() { if (this._isPlaying) this.pause(); else this.play(); }
  unload() {
    if (this._isPlaying && this.blob) {
      mocks.log.push({ type: 'stop', seg: this.segment, at: Date.now(), ...this.observe() });
    }
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this._isPlaying = false;
    this.blob = null;
    this.position = 0;
    this._duration = 0;
  }
  seek() {}
  seekForward() {}
  seekBackward() {}
  setVolume() {}
  setPlaybackRate() {}
}

vi.mock('@/stores', () => {
  const project = { id: 'p', title: 'Sample', chunks: [], originalContent: '' };
  const playerActions = {
    play: () => { mocks.playerState.isPlaying = true; },
    pause: () => { mocks.playerState.isPlaying = false; },
    updateCurrentTime: (t: number) => { mocks.playerState.currentTime = t; },
    updateCurrentWord: () => {},
    setTotalDuration: (d: number) => { mocks.playerState.totalDuration = d; },
    setError: () => {},
    setVolume: () => {},
    setSpeed: () => {},
  };
  return {
    useProjectState: () => ({ currentProject: project }),
    useProjectActions: () => ({ updateLastPosition: () => {} }),
    usePlayerState: () => mocks.playerState,
    usePlayerActions: () => playerActions,
    useUIActions: () => ({ addToast: mocks.addToast }),
    useSettingsState: () => ({ defaultProvider: 'kokoro', defaultVoiceId: 'af_heart' }),
  };
});

vi.mock('@/services/audio', async () => {
  const cache = await import('@/services/audio/AudioCacheManager');
  return {
    ...cache,
    getAudioPlayer: () => {
      if (!mocks.player) mocks.player = new FakeAudioPlayer();
      return mocks.player;
    },
  };
});

const segments = segmentText(SAMPLE_TEXT, 'p');

/** Fake synthesizer: a fixed delay per segment, then a blob the player can identify. */
const synthesize = vi.fn(async (options: TTSOptions): Promise<TTSResult> => {
  const seg = segments.findIndex((s) => s.text === options.text);
  await new Promise((r) => setTimeout(r, SYNTH_DELAY_MS));
  const audioBlob = new Blob([`segment-${seg}`], { type: 'audio/wav' });
  mocks.blobSegment.set(audioBlob, seg);
  const timing: WordTiming[] = [{ word: `seg${seg}`, startTime: 0, endTime: DURATION_S[seg] }];
  return { audioBlob, audioUrl: 'blob:fake', duration: DURATION_S[seg], timing };
});
vi.mock('@/hooks/useTTSProvider', () => ({ useTTSProvider: () => () => ({ synthesize }) }));

vi.mock('@/db/schema', () => {
  const put = vi.fn(async (audio: { id: string }) => {
    mocks.rows.set(audio.id, audio);
    return audio.id;
  });
  return {
    saveCachedAudio: put,
    db: {
      audioCache: {
        put,
        where: vi.fn(() => ({
          equals: vi.fn(() => ({ first: async () => undefined, toArray: async () => [], modify: async () => {} })),
        })),
      },
      transaction: async (_m: string, _t: unknown, cb: () => Promise<void>) => cb(),
    },
  };
});

function renderReader() {
  const hook = renderHook(() => {
    const gen = useAudioGeneration(segments, {});
    const playback = useSegmentPlayback(segments, gen.generateSegmentAudio, gen.preloadNextSegments, {
      isPaginated: false,
      currentPage: 0,
      onPageChange: () => {},
    }, gen.cancelPreloads);
    return { gen, playback };
  });
  const player = mocks.player as FakeAudioPlayer;
  player.observe = () => {
    const { currentSegmentIndex, currentTiming } = hook.result.current.playback;
    const word = currentTiming?.[0]?.word;
    return { card: currentSegmentIndex, timingFor: word ? Number(word.slice(3)) : -1 };
  };
  return hook;
}

/** Advance fake time in small steps, each in its own act(), so React renders between them. */
const run = async (ms: number) => {
  for (let left = ms; left > 0; left -= 250) {
    await act(async () => { await vi.advanceTimersByTimeAsync(Math.min(250, left)); });
  }
};

const played = () => mocks.log.filter((e) => e.type === 'play').map((e) => e.seg);
const ended = () => mocks.log.filter((e) => e.type === 'end').map((e) => e.seg);

beforeEach(() => {
  vi.useFakeTimers();
  resetAudioCacheManager();
  mocks.rows.clear();
  mocks.log.length = 0;
  mocks.player = new FakeAudioPlayer();
  Object.assign(mocks.playerState, { isPlaying: false, currentTime: 0, totalDuration: 0 });
  synthesize.mockClear();
  mocks.addToast.mockClear();
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('sample chapter playback queue', () => {
  it('has five segments in the sample', () => {
    expect(segments).toHaveLength(5);
  });

  it('defect 1: one Play plays all five segments in order with no further action', async () => {
    const { result } = renderReader();
    // The sample button's autoplay calls handlePlayPause once; nothing else is pressed.
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(5 * (SYNTH_DELAY_MS + 20_000));

    expect(played()).toEqual([0, 1, 2, 3, 4]);
    expect(ended()).toEqual([0, 1, 2, 3, 4]);
  });

  it('defect 2: pressing Play during a gap neither replays stale audio nor reorders segments', async () => {
    const { result } = renderReader();
    await act(async () => { result.current.playback.setAutoRead(true); });
    await act(async () => { void result.current.playback.handlePlayPause(); });

    // Segment 0 starts once synthesized, then ends after 1 s. Segment 1 is still being
    // synthesized (the preload started together with segment 0's playback).
    await run(SYNTH_DELAY_MS + 1000 + 200);
    // The user presses Play in the silent gap, as the audit's Auto + Play run did.
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(5 * (SYNTH_DELAY_MS + 20_000));

    expect(played()).toEqual([0, 1, 2, 3, 4]);
    // Each segment ran to its own end: none was cut short by a competing load.
    expect(ended()).toEqual([0, 1, 2, 3, 4]);
    expect(mocks.log.filter((e) => e.type === 'stop')).toEqual([]);
    // The highlighted card and its words belong to the audio that played. (Checked when each
    // segment ends: at the instant play() fires, React may not have rendered yet.)
    for (const e of mocks.log.filter((x) => x.type === 'end')) {
      expect({ seg: e.seg, card: e.card, timingFor: e.timingFor }).toEqual({ seg: e.seg, card: e.seg, timingFor: e.seg });
    }
  });

  it('defect 2: the active card never shows the previous segment text while the next one prepares', async () => {
    const { result } = renderReader();
    await act(async () => { result.current.playback.setAutoRead(true); });
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(SYNTH_DELAY_MS + 1000 + 200);

    const { currentSegmentIndex, currentTiming } = result.current.playback;
    expect(currentSegmentIndex).toBe(1);
    // Either no timing yet (plain segment text renders) or segment 1's own timing.
    if (currentTiming) expect(currentTiming[0].word).toBe('seg1');
  });

  it('a later segment click supersedes an earlier one that is still preparing', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handleSegmentClick(3); });
    await run(100);
    await act(async () => { void result.current.playback.handleSegmentClick(1); });
    await run(3 * SYNTH_DELAY_MS + 200);

    expect(played()[0]).toBe(1);
    expect(played()).not.toContain(3);
  });

  it('defect 3: shows a preparing state, and Play cannot fire, while audio is generated', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(500);
    expect(result.current.playback.isPreparing).toBe(true);
    expect(result.current.playback.preparingSegmentIndex).toBe(0);

    await run(SYNTH_DELAY_MS);
    expect(result.current.playback.isPreparing).toBe(false);
    expect(played()).toEqual([0]);

    // Segment 0 ends; segment 1 was preloaded but is not ready yet: preparing again.
    await run(1000 + 50);
    expect(result.current.playback.currentSegmentIndex).toBe(1);
    expect(result.current.playback.isPreparing).toBe(true);
  });

  it('turning Auto off stops at the end of the current segment', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(SYNTH_DELAY_MS + 100);
    await act(async () => { void result.current.playback.handleAutoReadToggle(); });
    expect(result.current.playback.autoRead).toBe(false);
    await run(5 * (SYNTH_DELAY_MS + 20_000));
    expect(played()).toEqual([0]);
  });
});

describe('handing playback to Full Audio Mode', () => {
  const player = () => mocks.player as FakeAudioPlayer;

  it('stops the reader at once when suspended while a segment plays, and never advances', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    // Segment 0 plays (1 s) and ends; segment 1 was preloaded and is now playing.
    await run(2 * SYNTH_DELAY_MS + 1500);
    expect(player().isPlaying).toBe(true);
    const playedBefore = played().length;

    await act(async () => { result.current.playback.setSuspended(true); });
    expect(player().isPlaying).toBe(false);
    expect(player().isLoaded).toBe(false);
    expect(result.current.playback.isPreparing).toBe(false);

    await run(5 * (SYNTH_DELAY_MS + 20_000));
    expect(played()).toHaveLength(playedBefore);
    expect(player().isPlaying).toBe(false);
  });

  it('drops a request that is still preparing, so it never starts audio', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(500);
    expect(result.current.playback.isPreparing).toBe(true);

    await act(async () => { result.current.playback.setSuspended(true); });
    expect(result.current.playback.isPreparing).toBe(false);
    await run(5 * (SYNTH_DELAY_MS + 20_000));
    expect(played()).toEqual([]);
  });

  it('ignores Play, Auto and segment clicks while suspended', async () => {
    const { result } = renderReader();
    await act(async () => { result.current.playback.setSuspended(true); });
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await act(async () => { void result.current.playback.handleSegmentClick(2); });
    await act(async () => { void result.current.playback.handleAutoReadToggle(); });
    await act(async () => { void result.current.playback.handleAutoReadToggle(); });
    await run(3 * SYNTH_DELAY_MS);
    expect(played()).toEqual([]);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('cancels queued preloads, so they do not compete with Full Audio generation', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    // Segment 0 synthesized and playing; preloads for 1, 2 and 3 queued, 1 running.
    await run(SYNTH_DELAY_MS + 100);
    expect(synthesize).toHaveBeenCalledTimes(2);

    await act(async () => { result.current.playback.setSuspended(true); });
    await run(5 * SYNTH_DELAY_MS);
    // Only the preload already running finished; 2 and 3 never ran.
    expect(synthesize).toHaveBeenCalledTimes(2);
    expect(played()).toEqual([0]);
  });

  it('after resuming, the reader stays stopped until Play, then plays on in order', async () => {
    const { result } = renderReader();
    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(SYNTH_DELAY_MS + 200);
    expect(played()).toEqual([0]);
    await act(async () => { result.current.playback.setSuspended(true); });
    await act(async () => { result.current.playback.setSuspended(false); });
    await run(3 * SYNTH_DELAY_MS);
    expect(played()).toEqual([0]);

    await act(async () => { void result.current.playback.handlePlayPause(); });
    await run(5 * (SYNTH_DELAY_MS + 20_000));
    expect(played()).toEqual([0, 0, 1, 2, 3, 4]);
    expect(ended().slice(-4)).toEqual([1, 2, 3, 4]);
  });
});
