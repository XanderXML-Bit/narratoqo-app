import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useFullAudioPlayer } from './useFullAudioPlayer';

// Mock howler with a proper class
vi.mock('howler', () => {
  class MockHowl {
    _onload: (() => void) | undefined;
    _onplay: (() => void) | undefined;
    _onpause: (() => void) | undefined;
    _onstop: (() => void) | undefined;
    _onend: (() => void) | undefined;
    _onloaderror: ((_id: number, error: string) => void) | undefined;
    _onseek: (() => void) | undefined;

    constructor(options: Record<string, unknown>) {
      this._onload = options.onload as (() => void) | undefined;
      this._onplay = options.onplay as (() => void) | undefined;
      this._onpause = options.onpause as (() => void) | undefined;
      this._onstop = options.onstop as (() => void) | undefined;
      this._onend = options.onend as (() => void) | undefined;
      this._onloaderror = options.onloaderror as ((_id: number, error: string) => void) | undefined;
      this._onseek = options.onseek as (() => void) | undefined;
    }

    play() { this._onplay?.(); }
    pause() { this._onpause?.(); }
    stop() { this._onstop?.(); }
    seek() { return 0; }
    rate() {}
    volume() {}
    duration() { return 60; }
    playing() { return false; }
    unload() {}
  }

  return { Howl: MockHowl };
});

// Mock AudioExporter
vi.mock('@/services/audio/AudioExporter', () => ({
  getAudioExporter: () => ({
    findPositionAtTime: vi.fn().mockReturnValue({ segmentIndex: 0, wordIndex: 0 }),
    getGlobalTime: vi.fn().mockReturnValue(0),
  }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('useFullAudioPlayer', () => {
  it('should return initial state', () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    expect(result.current.state).toEqual({
      isPlaying: false,
      isLoaded: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1,
      volume: 1,
      error: null,
      currentSegmentIndex: 0,
      currentWordIndex: -1,
    });
  });

  it('should expose all action methods', () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    expect(result.current.actions).toHaveProperty('load');
    expect(result.current.actions).toHaveProperty('play');
    expect(result.current.actions).toHaveProperty('pause');
    expect(result.current.actions).toHaveProperty('togglePlay');
    expect(result.current.actions).toHaveProperty('seek');
    expect(result.current.actions).toHaveProperty('seekToSegment');
    expect(result.current.actions).toHaveProperty('setPlaybackRate');
    expect(result.current.actions).toHaveProperty('setVolume');
    expect(result.current.actions).toHaveProperty('unload');
  });

  it('should start with null timing map', () => {
    const { result } = renderHook(() => useFullAudioPlayer());
    expect(result.current.timingMap).toBeNull();
  });

  it('should set loading state when load is called', async () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    const blob = new Blob(['audio'], { type: 'audio/wav' });
    const timingMap = { segments: [], totalDuration: 60 };

    await act(async () => {
      await result.current.actions.load(blob, timingMap as never);
    });

    // Howl was created; URL.createObjectURL was called
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    // isLoading was set to true at minimum; the Howl constructor ran
    // Since MockHowl doesn't auto-fire onload, state should still be loading
    expect(result.current.state.isLoading).toBe(true);
    expect(result.current.state.error).toBeNull();
  });

  it('should set playback rate', () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    act(() => {
      result.current.actions.setPlaybackRate(1.5);
    });

    expect(result.current.state.playbackSpeed).toBe(1.5);
  });

  it('should set volume clamped between 0 and 1', () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    act(() => {
      result.current.actions.setVolume(0.5);
    });
    expect(result.current.state.volume).toBe(0.5);

    act(() => {
      result.current.actions.setVolume(2);
    });
    expect(result.current.state.volume).toBe(1);

    act(() => {
      result.current.actions.setVolume(-1);
    });
    expect(result.current.state.volume).toBe(0);
  });

  it('should reset state on unload', () => {
    const { result } = renderHook(() => useFullAudioPlayer());

    act(() => {
      result.current.actions.setPlaybackRate(2);
      result.current.actions.setVolume(0.5);
    });

    act(() => {
      result.current.actions.unload();
    });

    expect(result.current.state).toEqual({
      isPlaying: false,
      isLoaded: false,
      isLoading: false,
      currentTime: 0,
      duration: 0,
      playbackSpeed: 1,
      volume: 1,
      error: null,
      currentSegmentIndex: 0,
      currentWordIndex: -1,
    });
  });

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() => useFullAudioPlayer());
    expect(() => unmount()).not.toThrow();
  });
});
