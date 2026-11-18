import { useState, useCallback, useRef, useEffect } from 'react';
import { Howl } from 'howler';
import type { GlobalTimingMap } from '@/services/audio/AudioExporter';
import { getAudioExporter } from '@/services/audio/AudioExporter';
import { getBlobURLManager } from '@/services/audio/BlobURLManager';

export interface FullAudioPlayerState {
  isPlaying: boolean;
  isLoaded: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  playbackSpeed: number;
  volume: number;
  error: string | null;
  /** Current segment index based on global time */
  currentSegmentIndex: number;
  /** Current word index within current segment */
  currentWordIndex: number;
}

export interface FullAudioPlayerActions {
  load: (audioBlob: Blob, timingMap: GlobalTimingMap) => Promise<void>;
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (time: number) => void;
  seekToSegment: (segmentIndex: number, wordIndex?: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  unload: () => void;
}

export interface UseFullAudioPlayerResult {
  state: FullAudioPlayerState;
  actions: FullAudioPlayerActions;
  timingMap: GlobalTimingMap | null;
}

// Update interval for word highlighting
// 100ms is a good balance between smoothness and performance
// (Human perception threshold for audio-visual sync is ~80-100ms)
const TIME_UPDATE_INTERVAL = 100;

/**
 * Hook for managing full audio playback with word-level timing synchronization.
 * This manages a single Howler instance that plays the concatenated full audiobook.
 */
export function useFullAudioPlayer(): UseFullAudioPlayerResult {
  const [state, setState] = useState<FullAudioPlayerState>({
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

  const howlRef = useRef<Howl | null>(null);
  const timingMapRef = useRef<GlobalTimingMap | null>(null);
  const timeUpdateIntervalRef = useRef<number | null>(null);
  const objectUrlRef = useRef<string | null>(null);

  // Clean up RAF on unmount
  useEffect(() => {
    return () => {
      if (timeUpdateIntervalRef.current) {
        cancelAnimationFrame(timeUpdateIntervalRef.current);
      }
      if (howlRef.current) {
        howlRef.current.unload();
      }
      if (objectUrlRef.current) {
        getBlobURLManager().revokeByUrl(objectUrlRef.current);
      }
    };
  }, []);

  // Track last position to avoid unnecessary state updates
  const lastPositionRef = useRef({ segmentIndex: -1, wordIndex: -1, time: -1 });

  // Update current position based on global time
  // Only updates state if position actually changed (reduces re-renders)
  const updatePositionFromTime = useCallback((currentTime: number) => {
    if (!timingMapRef.current) return;

    const exporter = getAudioExporter();
    const position = exporter.findPositionAtTime(timingMapRef.current, currentTime);

    if (position) {
      const last = lastPositionRef.current;
      const segmentOrWordChanged =
        last.segmentIndex !== position.segmentIndex ||
        last.wordIndex !== position.wordIndex;

      if (segmentOrWordChanged) {
        lastPositionRef.current = {
          segmentIndex: position.segmentIndex,
          wordIndex: position.wordIndex,
          time: currentTime,
        };
        setState(prev => ({
          ...prev,
          currentTime,
          currentSegmentIndex: position.segmentIndex,
          currentWordIndex: position.wordIndex,
        }));
      } else {
        // Always update time for smooth progress bar (throttled by TIME_UPDATE_INTERVAL)
        lastPositionRef.current.time = currentTime;
        setState(prev => ({ ...prev, currentTime }));
      }
    } else {
      setState(prev => ({ ...prev, currentTime }));
    }
  }, []);

  // Start time update loop using requestAnimationFrame (throttled to ~100ms)
  const startTimeUpdates = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      cancelAnimationFrame(timeUpdateIntervalRef.current);
    }

    let lastUpdate = 0;
    const tick = (timestamp: number) => {
      if (timestamp - lastUpdate >= TIME_UPDATE_INTERVAL) {
        lastUpdate = timestamp;
        if (howlRef.current && howlRef.current.playing()) {
          const currentTime = howlRef.current.seek() as number;
          updatePositionFromTime(currentTime);
        }
      }
      timeUpdateIntervalRef.current = requestAnimationFrame(tick);
    };
    timeUpdateIntervalRef.current = requestAnimationFrame(tick);
  }, [updatePositionFromTime]);

  // Stop time update loop
  const stopTimeUpdates = useCallback(() => {
    if (timeUpdateIntervalRef.current) {
      cancelAnimationFrame(timeUpdateIntervalRef.current);
      timeUpdateIntervalRef.current = null;
    }
  }, []);

  // Load audio blob with timing map
  const load = useCallback(async (audioBlob: Blob, timingMap: GlobalTimingMap) => {
    // Unload previous audio
    if (howlRef.current) {
      howlRef.current.unload();
    }
    if (objectUrlRef.current) {
      getBlobURLManager().revokeByUrl(objectUrlRef.current);
    }
    stopTimeUpdates();

    setState(prev => ({
      ...prev,
      isLoading: true,
      isLoaded: false,
      error: null,
    }));

    try {
      // Create object URL for the blob
      const objectUrl = getBlobURLManager().create(audioBlob, `full-audio-${Date.now()}`);
      objectUrlRef.current = objectUrl;
      timingMapRef.current = timingMap;

      // Create Howl instance
      const howl = new Howl({
        src: [objectUrl],
        format: ['wav'],
        html5: true, // Use HTML5 audio for large files
        preload: true,
        onload: () => {
          setState(prev => ({
            ...prev,
            isLoading: false,
            isLoaded: true,
            duration: howl.duration(),
          }));
        },
        onloaderror: (_id, error) => {
          setState(prev => ({
            ...prev,
            isLoading: false,
            error: `Failed to load audio: ${error}`,
          }));
        },
        onplay: () => {
          setState(prev => ({ ...prev, isPlaying: true }));
          startTimeUpdates();
        },
        onpause: () => {
          setState(prev => ({ ...prev, isPlaying: false }));
          stopTimeUpdates();
        },
        onstop: () => {
          setState(prev => ({ ...prev, isPlaying: false }));
          stopTimeUpdates();
        },
        onend: () => {
          setState(prev => ({ ...prev, isPlaying: false }));
          stopTimeUpdates();
        },
        onseek: () => {
          const currentTime = howl.seek() as number;
          updatePositionFromTime(currentTime);
        },
      });

      howlRef.current = howl;
    } catch (error) {
      // Revoke the object URL to prevent memory leak on failed load
      if (objectUrlRef.current) {
        getBlobURLManager().revokeByUrl(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : 'Failed to load audio',
      }));
    }
  }, [startTimeUpdates, stopTimeUpdates, updatePositionFromTime]);

  // Play
  const play = useCallback(() => {
    if (howlRef.current && state.isLoaded) {
      howlRef.current.play();
    }
  }, [state.isLoaded]);

  // Pause
  const pause = useCallback(() => {
    if (howlRef.current) {
      howlRef.current.pause();
    }
  }, []);

  // Toggle play/pause
  const togglePlay = useCallback(() => {
    if (state.isPlaying) {
      pause();
    } else {
      play();
    }
  }, [state.isPlaying, play, pause]);

  // Seek to time
  const seek = useCallback((time: number) => {
    if (howlRef.current && state.isLoaded) {
      const clampedTime = Math.max(0, Math.min(time, state.duration));
      howlRef.current.seek(clampedTime);
      updatePositionFromTime(clampedTime);
    }
  }, [state.isLoaded, state.duration, updatePositionFromTime]);

  // Seek to segment/word
  const seekToSegment = useCallback((segmentIndex: number, wordIndex?: number) => {
    if (!timingMapRef.current) return;

    const exporter = getAudioExporter();
    const globalTime = exporter.getGlobalTime(timingMapRef.current, segmentIndex, wordIndex);
    seek(globalTime);
  }, [seek]);

  // Set playback rate
  const setPlaybackRate = useCallback((rate: number) => {
    if (howlRef.current) {
      howlRef.current.rate(rate);
    }
    setState(prev => ({ ...prev, playbackSpeed: rate }));
  }, []);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    const clampedVolume = Math.max(0, Math.min(1, volume));
    if (howlRef.current) {
      howlRef.current.volume(clampedVolume);
    }
    setState(prev => ({ ...prev, volume: clampedVolume }));
  }, []);

  // Unload audio
  const unload = useCallback(() => {
    stopTimeUpdates();
    if (howlRef.current) {
      howlRef.current.unload();
      howlRef.current = null;
    }
    if (objectUrlRef.current) {
      getBlobURLManager().revokeByUrl(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    timingMapRef.current = null;
    setState({
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
  }, [stopTimeUpdates]);

  return {
    state,
    actions: {
      load,
      play,
      pause,
      togglePlay,
      seek,
      seekToSegment,
      setPlaybackRate,
      setVolume,
      unload,
    },
    timingMap: timingMapRef.current,
  };
}

export default useFullAudioPlayer;
