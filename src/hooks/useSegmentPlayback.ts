import { useEffect, useState, useCallback, useRef } from 'react';
import { useProjectState, useProjectActions, usePlayerState, usePlayerActions, useUIActions } from '@/stores';
import { getAudioPlayer } from '@/services/audio';
import { findNextReadableSegment, getPageForSegment, hasReadableText, type TextSegment } from '@/services/segmentation';
import type { CachedAudio, WordTiming } from '@/types';
import { SEEK_STEP_SECONDS } from '@/utils/constants';

const SEGMENTS_PER_PAGE = 5;

export { SEEK_STEP_SECONDS };

interface UseSegmentPlaybackOptions {
  isPaginated: boolean;
  currentPage: number;
  onPageChange: (page: number) => void;
}

export interface UseSegmentPlaybackResult {
  currentSegmentIndex: number;
  currentWordIndex: number;
  currentTiming: WordTiming[] | undefined;
  autoRead: boolean;
  setAutoRead: (v: boolean) => void;
  /** True while the segment the listener asked for is being generated or loaded. */
  isPreparing: boolean;
  preparingSegmentIndex: number | null;
  setCurrentSegmentIndex: (v: number) => void;
  handleSegmentClick: (index: number) => Promise<void>;
  handlePlayPause: () => Promise<void>;
  handleAutoReadToggle: () => Promise<void>;
  handleSeekBackward: () => void;
  handleSeekForward: () => void;
  handleWordClick: (wordIndex: number, timing: WordTiming) => void;
  handlePrevSegment: () => Promise<void>;
  handleNextSegment: () => Promise<void>;
  handleVolumeChange: (volume: number) => void;
  handleMuteToggle: () => void;
  handleSpeedChange: (speed: number) => void;
  handleSeek: (time: number) => void;
  /**
   * Hand playback to another player (Full Audio Mode) or take it back. Suspending stops the
   * segment audio at once, drops any request still preparing, cancels queued preloads and
   * keeps the queue from advancing. Resuming only re-enables the controls: the reader stays
   * stopped on the same segment until the listener presses Play.
   */
  setSuspended: (suspended: boolean) => void;
}

/** Manages segment-level playback: navigation, highlighting, audio player callbacks. */
export function useSegmentPlayback(
  segments: TextSegment[],
  generateSegmentAudio: (index: number, showSpinner?: boolean) => Promise<CachedAudio | undefined>,
  preloadNextSegments: (fromIndex: number, count?: number) => Promise<void>,
  options: UseSegmentPlaybackOptions,
  cancelPreloads?: () => void,
): UseSegmentPlaybackResult {
  const { isPaginated, currentPage, onPageChange } = options;
  const { currentProject } = useProjectState();
  const { updateLastPosition } = useProjectActions();
  const playerState = usePlayerState();
  const playerActions = usePlayerActions();
  const { addToast } = useUIActions();

  const audioPlayer = getAudioPlayer();

  const [currentSegmentIndex, setCurrentSegmentIndexState] = useState(0);
  // Continuous play is the default: one Play reads to the end. "Auto" turns it off.
  const [autoRead, setAutoRead] = useState(true);
  const [currentTiming, setCurrentTiming] = useState<WordTiming[] | undefined>();
  const [currentWordIndex, setCurrentWordIndex] = useState(-1);
  const [preparingSegmentIndex, setPreparingSegmentIndex] = useState<number | null>(null);

  // Refs for stable callback access
  const autoReadRef = useRef(autoRead);
  const currentSegmentRef = useRef(currentSegmentIndex);
  const segmentsRef = useRef(segments);
  const playSegmentRef = useRef<((index: number) => Promise<void>) | undefined>(undefined);
  const currentProjectRef = useRef(currentProject);
  const playerStateRef = useRef(playerState);
  /** Incremented by every playback request; an older request that resolves late is dropped. */
  const requestIdRef = useRef(0);
  /** Segment whose audio the player holds, or null when nothing is loaded. */
  const loadedSegmentRef = useRef<number | null>(null);
  const preparingRef = useRef<number | null>(null);
  /** True after the loaded segment played to its end. */
  const endedRef = useRef(false);
  /** True while another player (Full Audio Mode) owns playback. */
  const suspendedRef = useRef(false);

  // Keep refs in sync
  useEffect(() => { autoReadRef.current = autoRead; }, [autoRead]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);
  useEffect(() => { currentProjectRef.current = currentProject; }, [currentProject]);
  useEffect(() => { playerStateRef.current = playerState; }, [playerState]);

  /** Sets the active segment and its ref together, so callbacks never read a stale index. */
  const setCurrentSegmentIndex = useCallback((index: number) => {
    currentSegmentRef.current = index;
    setCurrentSegmentIndexState(index);
  }, []);

  const setPreparing = useCallback((index: number | null) => {
    preparingRef.current = index;
    setPreparingSegmentIndex(index);
  }, []);

  // Auto-scroll to current segment
  const segmentRefs = useRef<Map<number, HTMLElement>>(new Map());
  useEffect(() => {
    if (!options.isPaginated && segmentRefs.current.has(currentSegmentIndex)) {
      const segmentEl = segmentRefs.current.get(currentSegmentIndex);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSegmentIndex, options.isPaginated]);

  // Setup audio player callbacks and cleanup
  useEffect(() => {
    audioPlayer.setCallbacks({
      onTimeUpdate: (time) => {
        playerActions.updateCurrentTime(time);
      },
      onWordUpdate: (index) => {
        setCurrentWordIndex(index);
        playerActions.updateCurrentWord(index);
      },
      onPlay: () => {
        endedRef.current = false;
        playerActions.play();
      },
      onPause: () => {
        playerActions.pause();
      },
      onEnd: () => {
        playerActions.pause();
        setCurrentWordIndex(-1);
        endedRef.current = true;

        // Only the segment that is current may advance the queue, and never while suspended.
        if (suspendedRef.current) return;
        if (loadedSegmentRef.current !== currentSegmentRef.current) return;

        if (autoReadRef.current) {
          const nextIdx = findNextReadableSegment(segmentsRef.current, currentSegmentRef.current, 'forward');
          if (nextIdx !== -1) {
            void playSegmentRef.current?.(nextIdx);
          } else {
            addToast({ type: 'info', message: 'Finished reading all segments' });
          }
        }
      },
      onError: (error) => {
        addToast({ type: 'error', message: error.message });
        playerActions.setError(error.message);
      },
    });

    const requestIds = requestIdRef;
    return () => {
      const project = currentProjectRef.current;
      const state = playerStateRef.current;
      if (project) {
        updateLastPosition(project.id, currentSegmentRef.current, state.currentTime);
      }
      // Drop any request still preparing, so it cannot start audio after the reader closes.
      requestIds.current++;
      audioPlayer.pause();
      audioPlayer.unload();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Play one segment. The newest request wins: the previous audio is unloaded at once (so
   * Play cannot resume it under the new card), and a request that is superseded while its
   * audio is still being generated or loaded never plays.
   */
  const playSegment = useCallback(async (segmentIndex: number) => {
    if (!currentProject || suspendedRef.current) return;

    let targetIndex = segmentIndex;
    if (!hasReadableText(segments[segmentIndex]?.text ?? '')) {
      const nextReadable = findNextReadableSegment(segments, segmentIndex - 1, 'forward');
      if (nextReadable === -1) {
        addToast({ type: 'info', message: 'No readable segments found' });
        return;
      }
      targetIndex = nextReadable;
    }

    const requestId = ++requestIdRef.current;
    const isCurrent = () => requestId === requestIdRef.current;

    audioPlayer.unload();
    loadedSegmentRef.current = null;
    endedRef.current = false;
    playerActions.pause();
    playerActions.updateCurrentTime(0);
    playerActions.setTotalDuration(0);
    setCurrentTiming(undefined);
    setCurrentWordIndex(-1);
    setCurrentSegmentIndex(targetIndex);
    setPreparing(targetIndex);

    if (isPaginated) {
      const newPage = getPageForSegment(targetIndex, SEGMENTS_PER_PAGE);
      if (newPage !== currentPage) {
        onPageChange(newPage);
      }
    }

    let cachedAudio: CachedAudio | undefined;
    try {
      cachedAudio = await generateSegmentAudio(targetIndex, true);
    } catch (error) {
      cachedAudio = undefined;
      if (isCurrent()) {
        addToast({ type: 'error', message: error instanceof Error ? error.message : 'Failed to generate audio' });
      }
    }
    if (!isCurrent()) return;
    if (!cachedAudio) {
      setPreparing(null);
      return;
    }

    try {
      await audioPlayer.load(cachedAudio.blob, cachedAudio.timing);
    } catch {
      if (isCurrent()) setPreparing(null);
      return;
    }
    if (!isCurrent() || suspendedRef.current) return;

    loadedSegmentRef.current = targetIndex;
    setCurrentTiming(cachedAudio.timing);
    playerActions.setTotalDuration(audioPlayer.duration);
    setPreparing(null);
    audioPlayer.play();

    preloadNextSegments(targetIndex, 3);
  }, [currentProject, segments, isPaginated, currentPage, onPageChange, generateSegmentAudio, audioPlayer, playerActions, preloadNextSegments, addToast, setCurrentSegmentIndex, setPreparing]);

  // Keep handler ref updated for auto-advance
  useEffect(() => {
    playSegmentRef.current = playSegment;
  }, [playSegment]);

  const handleSegmentClick = playSegment;

  const handlePlayPause = useCallback(async () => {
    if (suspendedRef.current) return;
    // Audio for the current segment is still being prepared: nothing to toggle yet.
    if (preparingRef.current !== null) return;
    if (audioPlayer.isLoaded && loadedSegmentRef.current === currentSegmentRef.current) {
      audioPlayer.togglePlay();
    } else {
      await playSegment(currentSegmentRef.current);
    }
  }, [audioPlayer, playSegment]);

  const handleAutoReadToggle = useCallback(async () => {
    const newAutoRead = !autoReadRef.current;
    autoReadRef.current = newAutoRead;
    setAutoRead(newAutoRead);
    if (suspendedRef.current || !newAutoRead || audioPlayer.isPlaying || preparingRef.current !== null) return;

    // Turning Auto on while stopped continues the reading rather than repeating it.
    const current = currentSegmentRef.current;
    if (audioPlayer.isLoaded && loadedSegmentRef.current === current && !endedRef.current) {
      audioPlayer.play();
      return;
    }
    if (endedRef.current && loadedSegmentRef.current === current) {
      const nextIdx = findNextReadableSegment(segmentsRef.current, current, 'forward');
      if (nextIdx !== -1) await playSegment(nextIdx);
      return;
    }
    await playSegment(current);
  }, [audioPlayer, playSegment]);

  const setSuspended = useCallback((suspended: boolean) => {
    if (suspendedRef.current === suspended) return;
    suspendedRef.current = suspended;
    if (!suspended) return;
    // Supersede any request still generating or loading, so it can never start audio.
    requestIdRef.current++;
    cancelPreloads?.();
    audioPlayer.pause();
    audioPlayer.unload();
    loadedSegmentRef.current = null;
    endedRef.current = false;
    playerActions.pause();
    playerActions.updateCurrentTime(0);
    playerActions.setTotalDuration(0);
    setCurrentTiming(undefined);
    setCurrentWordIndex(-1);
    setPreparing(null);
  }, [audioPlayer, cancelPreloads, playerActions, setPreparing]);

  const handleSeekBackward = useCallback(() => { audioPlayer.seekBackward(SEEK_STEP_SECONDS); }, [audioPlayer]);
  const handleSeekForward = useCallback(() => { audioPlayer.seekForward(SEEK_STEP_SECONDS); }, [audioPlayer]);

  const handleWordClick = useCallback((_wordIndex: number, timing: WordTiming) => {
    audioPlayer.seek(timing.startTime);
  }, [audioPlayer]);

  const handlePrevSegment = useCallback(async () => {
    const prevIndex = findNextReadableSegment(segments, currentSegmentIndex, 'backward');
    if (prevIndex !== -1) {
      await handleSegmentClick(prevIndex);
    }
  }, [segments, currentSegmentIndex, handleSegmentClick]);

  const handleNextSegment = useCallback(async () => {
    const nextIndex = findNextReadableSegment(segments, currentSegmentIndex, 'forward');
    if (nextIndex !== -1) {
      await handleSegmentClick(nextIndex);
    }
  }, [segments, currentSegmentIndex, handleSegmentClick]);

  const handleVolumeChange = useCallback((volume: number) => {
    playerActions.setVolume(volume);
    audioPlayer.setVolume(volume);
  }, [playerActions, audioPlayer]);

  const handleMuteToggle = useCallback(() => {
    const newVolume = playerState.volume > 0 ? 0 : 1;
    playerActions.setVolume(newVolume);
    audioPlayer.setVolume(newVolume);
  }, [playerState.volume, playerActions, audioPlayer]);

  const handleSpeedChange = useCallback((speed: number) => {
    playerActions.setSpeed(speed);
    audioPlayer.setPlaybackRate(speed);
  }, [playerActions, audioPlayer]);

  const handleSeek = useCallback((time: number) => {
    audioPlayer.seek(time);
  }, [audioPlayer]);

  return {
    currentSegmentIndex,
    currentWordIndex,
    currentTiming,
    autoRead,
    setAutoRead,
    isPreparing: preparingSegmentIndex !== null,
    preparingSegmentIndex,
    setCurrentSegmentIndex,
    handleSegmentClick,
    handlePlayPause,
    handleAutoReadToggle,
    handleSeekBackward,
    handleSeekForward,
    handleWordClick,
    handlePrevSegment,
    handleNextSegment,
    handleVolumeChange,
    handleMuteToggle,
    handleSpeedChange,
    handleSeek,
    setSuspended,
  };
}
