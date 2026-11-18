import { useEffect, useState, useCallback, useRef } from 'react';
import { useSettingsState, usePlayerActions, useUIActions, useProjectState } from '@/stores';
import { saveCachedAudio } from '@/db/schema';
import { getAudioCacheManager } from '@/services/audio';
import { SynthesisQueue, SynthesisCancelledError } from '@/services/audio/SynthesisQueue';
import { useTTSProvider } from '@/hooks/useTTSProvider';
import { findNextReadableSegment, type TextSegment } from '@/services/segmentation';
import type { CachedAudio } from '@/types';

export interface UseAudioGenerationResult {
  generateSegmentAudio: (segmentIndex: number, showSpinner?: boolean) => Promise<CachedAudio | undefined>;
  preloadNextSegments: (fromIndex: number, count?: number) => Promise<void>;
  segmentAudioStatus: Record<number, 'idle' | 'generating' | 'ready'>;
  generatingSegmentIndex: number | null;
  /** Drop preloads that are queued but not yet running (the running one finishes). */
  cancelPreloads: () => void;
}

/** Manages TTS audio generation with caching and deduplication. */
export function useAudioGeneration(
  segments: TextSegment[],
  initialAudioStatus: Record<number, 'idle' | 'generating' | 'ready'>,
): UseAudioGenerationResult {
  const { currentProject } = useProjectState();
  const settings = useSettingsState();
  const playerActions = usePlayerActions();
  const { addToast } = useUIActions();
  const getTTSProvider = useTTSProvider();
  const audioCacheManager = getAudioCacheManager();

  const [segmentAudioStatus, setSegmentAudioStatus] = useState<Record<number, 'idle' | 'generating' | 'ready'>>({});
  const [generatingSegmentIndex, setGeneratingSegmentIndex] = useState<number | null>(null);

  const generationPromisesRef = useRef<Map<number, Promise<CachedAudio | undefined>>>(new Map());
  // One synthesis at a time, the segment being waited for first (see SynthesisQueue).
  const synthesisQueueRef = useRef<SynthesisQueue | null>(null);
  if (!synthesisQueueRef.current) synthesisQueueRef.current = new SynthesisQueue();

  // Sync initial audio status from loader
  useEffect(() => {
    if (Object.keys(initialAudioStatus).length > 0) {
      setSegmentAudioStatus(initialAudioStatus);
    }
  }, [initialAudioStatus]);

  // Re-check audio cache when provider/voice changes
  useEffect(() => {
    if (!currentProject || segments.length === 0) return;

    async function updateAudioStatus() {
      const cacheFilter = {
        provider: settings.defaultProvider,
        voiceId: settings.defaultVoiceId,
      };
      const audioStatus = await audioCacheManager.prefetch(currentProject!.id, cacheFilter);
      const statusRecord: Record<number, 'idle' | 'generating' | 'ready'> = {};
      segments.forEach((_, idx) => {
        statusRecord[idx] = audioStatus.has(idx) ? 'ready' : 'idle';
      });
      setSegmentAudioStatus(prev => {
        // Preserve 'generating' status
        const merged: Record<number, 'idle' | 'generating' | 'ready'> = {};
        segments.forEach((_, idx) => {
          merged[idx] = prev[idx] === 'generating' ? 'generating' : statusRecord[idx];
        });
        return merged;
      });
    }

    updateAudioStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, segments.length, settings.defaultProvider, settings.defaultVoiceId]);

  const generateSegmentAudio = useCallback(async (segmentIndex: number, showSpinner = true): Promise<CachedAudio | undefined> => {
    if (!currentProject || !segments[segmentIndex]) return undefined;

    const existingPromise = generationPromisesRef.current.get(segmentIndex);
    if (existingPromise) {
      // A preload is already queued or running for this segment: the listener now waits for it.
      if (showSpinner) synthesisQueueRef.current!.promote(segmentIndex);
      return existingPromise;
    }

    let resolvePromise!: (value: CachedAudio | undefined) => void;
    let rejectPromise!: (error: Error) => void;
    const placeholderPromise = new Promise<CachedAudio | undefined>((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });
    // Callers that joined this promise handle its rejection; this keeps an unjoined one quiet.
    placeholderPromise.catch(() => {});
    generationPromisesRef.current.set(segmentIndex, placeholderPromise);

    try {
      const cacheFilter = {
        provider: settings.defaultProvider,
        voiceId: settings.defaultVoiceId,
      };
      const cached = await audioCacheManager.get(currentProject.id, segmentIndex, cacheFilter);
      if (cached) {
        setSegmentAudioStatus(prev => ({ ...prev, [segmentIndex]: 'ready' }));
        resolvePromise(cached);
        return cached;
      }

      const segment = segments[segmentIndex];

      setSegmentAudioStatus(prev => ({ ...prev, [segmentIndex]: 'generating' }));
      if (showSpinner) {
        setGeneratingSegmentIndex(segmentIndex);
      }

      const provider = getTTSProvider();
      const result = await synthesisQueueRef.current!.enqueue(
        segmentIndex,
        () => provider.synthesize({
          text: segment.text,
          voiceId: settings.defaultVoiceId,
        }),
        showSpinner ? 'foreground' : 'background',
      );

      const cacheEntry: CachedAudio = {
        id: `${currentProject.id}-${segmentIndex}`,
        projectId: currentProject.id,
        chunkIndex: segmentIndex,
        blob: result.audioBlob,
        timing: result.timing,
        provider: settings.defaultProvider,
        voiceId: settings.defaultVoiceId,
        createdAt: new Date(),
        accessedAt: new Date(),
        sizeBytes: result.audioBlob.size,
      };

      await saveCachedAudio(cacheEntry);
      await audioCacheManager.save(cacheEntry);

      setSegmentAudioStatus(prev => ({ ...prev, [segmentIndex]: 'ready' }));
      resolvePromise(cacheEntry);
      return cacheEntry;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate audio';
      if (showSpinner) {
        addToast({ type: 'error', message });
        playerActions.setError(message);
      }
      setSegmentAudioStatus(prev => ({ ...prev, [segmentIndex]: 'idle' }));
      rejectPromise(error as Error);
      return undefined;
    } finally {
      generationPromisesRef.current.delete(segmentIndex);
      if (showSpinner) {
        setGeneratingSegmentIndex(null);
      }
    }
  }, [currentProject, segments, settings.defaultVoiceId, settings.defaultProvider, getTTSProvider, addToast, playerActions, audioCacheManager]);

  const preloadNextSegments = useCallback(async (fromIndex: number, count: number = 3) => {
    if (!currentProject) return;

    let preloaded = 0;
    let index = fromIndex;

    while (preloaded < count && index < segments.length - 1) {
      const nextIndex = findNextReadableSegment(segments, index, 'forward');
      if (nextIndex === -1) break;

      generateSegmentAudio(nextIndex, false)
        .catch(error => {
          if (!(error instanceof SynthesisCancelledError)) console.warn(`Preload segment ${nextIndex} failed:`, error);
        });

      preloaded++;
      index = nextIndex;
    }
  }, [currentProject, segments, generateSegmentAudio]);

  const cancelPreloads = useCallback(() => {
    synthesisQueueRef.current!.dropBackground();
  }, []);

  return {
    generateSegmentAudio,
    preloadNextSegments,
    cancelPreloads,
    segmentAudioStatus,
    generatingSegmentIndex,
  };
}
