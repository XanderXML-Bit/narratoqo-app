import type { StateCreator } from 'zustand';
import type { StoreState } from '../index';
import type { PlayerState } from '@/types';

export interface PlayerActions {
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

export type PlayerSlice = PlayerState & PlayerActions;

const initialPlayerState: PlayerState = {
  isPlaying: false,
  currentProjectId: null,
  currentChunkIndex: 0,
  currentTime: 0,
  totalDuration: 0,
  playbackSpeed: 1.0,
  volume: 1.0,
  currentWordIndex: -1,
  highlightMode: 'word',
  isBuffering: false,
  error: null,
};

export const createPlayerSlice: StateCreator<
  StoreState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  PlayerSlice
> = (set) => ({
  ...initialPlayerState,

  play: () => set({ isPlaying: true }, false, 'player/play'),

  pause: () => set({ isPlaying: false }, false, 'player/pause'),

  togglePlay: () =>
    set(
      (state) => ({ isPlaying: !state.isPlaying }),
      false,
      'player/togglePlay'
    ),

  seek: (time) => set({ currentTime: time }, false, 'player/seek'),

  seekToChunk: (index) =>
    set(
      {
        currentChunkIndex: index,
        currentTime: 0,
        currentWordIndex: -1,
      },
      false,
      'player/seekToChunk'
    ),

  setSpeed: (speed) => set({ playbackSpeed: speed }, false, 'player/setSpeed'),

  setVolume: (volume) => set({ volume }, false, 'player/setVolume'),

  setHighlightMode: (mode) =>
    set({ highlightMode: mode }, false, 'player/setHighlightMode'),

  setPlayerProjectId: (projectId) =>
    set(
      {
        currentProjectId: projectId,
        currentChunkIndex: 0,
        currentTime: 0,
        currentWordIndex: -1,
        isPlaying: false,
      },
      false,
      'player/setPlayerProjectId'
    ),

  updateCurrentTime: (time) =>
    set({ currentTime: time }, false, 'player/updateTime'),

  updateCurrentWord: (index) =>
    set({ currentWordIndex: index }, false, 'player/updateWord'),

  setTotalDuration: (duration) =>
    set({ totalDuration: duration }, false, 'player/setTotalDuration'),

  setBuffering: (isBuffering) =>
    set({ isBuffering }, false, 'player/setBuffering'),

  setError: (error) => set({ error }, false, 'player/setError'),

  resetPlayer: () => set(initialPlayerState, false, 'player/reset'),
});
