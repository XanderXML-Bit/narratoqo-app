import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';

// Minimal store for testing player slice behavior
// We test the logic directly instead of importing the full store
// (which requires persist middleware and sessionStorage)

describe('Player Slice Logic', () => {
  interface TestPlayerState {
    isPlaying: boolean;
    currentProjectId: string | null;
    currentChunkIndex: number;
    currentTime: number;
    totalDuration: number;
    playbackSpeed: number;
    volume: number;
    currentWordIndex: number;
    highlightMode: 'word' | 'sentence' | 'none';
    isBuffering: boolean;
    error: string | null;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seek: (time: number) => void;
    seekToChunk: (index: number) => void;
    setSpeed: (speed: number) => void;
    setVolume: (volume: number) => void;
    setHighlightMode: (mode: 'word' | 'sentence' | 'none') => void;
    setPlayerProjectId: (projectId: string | null) => void;
    updateCurrentTime: (time: number) => void;
    updateCurrentWord: (index: number) => void;
    setTotalDuration: (duration: number) => void;
    setBuffering: (isBuffering: boolean) => void;
    setError: (error: string | null) => void;
    resetPlayer: () => void;
  }

  const initialState = {
    isPlaying: false,
    currentProjectId: null,
    currentChunkIndex: 0,
    currentTime: 0,
    totalDuration: 0,
    playbackSpeed: 1.0,
    volume: 1.0,
    currentWordIndex: -1,
    highlightMode: 'word' as const,
    isBuffering: false,
    error: null,
  };

  let store: ReturnType<typeof createStore<TestPlayerState>>;

  beforeEach(() => {
    store = createStore<TestPlayerState>((set) => ({
      ...initialState,
      play: () => set({ isPlaying: true }),
      pause: () => set({ isPlaying: false }),
      togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
      seek: (time) => set({ currentTime: time }),
      seekToChunk: (index) => set({ currentChunkIndex: index, currentTime: 0, currentWordIndex: -1 }),
      setSpeed: (speed) => set({ playbackSpeed: speed }),
      setVolume: (volume) => set({ volume }),
      setHighlightMode: (mode) => set({ highlightMode: mode }),
      setPlayerProjectId: (projectId) => set({
        currentProjectId: projectId,
        currentChunkIndex: 0,
        currentTime: 0,
        currentWordIndex: -1,
        isPlaying: false,
      }),
      updateCurrentTime: (time) => set({ currentTime: time }),
      updateCurrentWord: (index) => set({ currentWordIndex: index }),
      setTotalDuration: (duration) => set({ totalDuration: duration }),
      setBuffering: (isBuffering) => set({ isBuffering }),
      setError: (error) => set({ error }),
      resetPlayer: () => set(initialState),
    }));
  });

  it('should start with default state', () => {
    const state = store.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentProjectId).toBeNull();
    expect(state.volume).toBe(1.0);
    expect(state.playbackSpeed).toBe(1.0);
    expect(state.currentWordIndex).toBe(-1);
    expect(state.highlightMode).toBe('word');
  });

  it('should toggle play state', () => {
    store.getState().play();
    expect(store.getState().isPlaying).toBe(true);

    store.getState().pause();
    expect(store.getState().isPlaying).toBe(false);

    store.getState().togglePlay();
    expect(store.getState().isPlaying).toBe(true);

    store.getState().togglePlay();
    expect(store.getState().isPlaying).toBe(false);
  });

  it('should seek to time', () => {
    store.getState().seek(5.5);
    expect(store.getState().currentTime).toBe(5.5);
  });

  it('should seek to chunk and reset state', () => {
    store.getState().updateCurrentTime(5);
    store.getState().updateCurrentWord(3);
    store.getState().seekToChunk(2);

    const state = store.getState();
    expect(state.currentChunkIndex).toBe(2);
    expect(state.currentTime).toBe(0);
    expect(state.currentWordIndex).toBe(-1);
  });

  it('should set volume and speed', () => {
    store.getState().setVolume(0.5);
    expect(store.getState().volume).toBe(0.5);

    store.getState().setSpeed(1.5);
    expect(store.getState().playbackSpeed).toBe(1.5);
  });

  it('should set highlight mode', () => {
    store.getState().setHighlightMode('sentence');
    expect(store.getState().highlightMode).toBe('sentence');

    store.getState().setHighlightMode('none');
    expect(store.getState().highlightMode).toBe('none');
  });

  it('should reset state when setting project ID', () => {
    store.getState().play();
    store.getState().updateCurrentTime(10);
    store.getState().seekToChunk(5);

    store.getState().setPlayerProjectId('new-project');
    const state = store.getState();
    expect(state.currentProjectId).toBe('new-project');
    expect(state.isPlaying).toBe(false);
    expect(state.currentTime).toBe(0);
    expect(state.currentChunkIndex).toBe(0);
    expect(state.currentWordIndex).toBe(-1);
  });

  it('should handle buffering and error states', () => {
    store.getState().setBuffering(true);
    expect(store.getState().isBuffering).toBe(true);

    store.getState().setError('Network error');
    expect(store.getState().error).toBe('Network error');

    store.getState().setError(null);
    expect(store.getState().error).toBeNull();
  });

  it('should set total duration', () => {
    store.getState().setTotalDuration(120);
    expect(store.getState().totalDuration).toBe(120);
  });

  it('should reset all state', () => {
    store.getState().play();
    store.getState().setPlayerProjectId('project-1');
    store.getState().updateCurrentTime(50);
    store.getState().setVolume(0.3);
    store.getState().setError('error');

    store.getState().resetPlayer();
    const state = store.getState();
    expect(state.isPlaying).toBe(false);
    expect(state.currentProjectId).toBeNull();
    expect(state.currentTime).toBe(0);
    expect(state.volume).toBe(1.0);
    expect(state.error).toBeNull();
  });
});
