import { useState, useEffect, useCallback, useRef } from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Loader2,
  AlertCircle,
  X,
} from 'lucide-react';
import { RawTextView } from './RawTextView';
import { formatTime } from '@/utils/formatTime';
import { useFullAudioPlayer } from '@/hooks/useFullAudioPlayer';
import { useTTSProvider } from '@/hooks/useTTSProvider';
import { useSettingsState } from '@/stores';
import { getAudioExporter } from '@/services/audio/AudioExporter';
import type { GlobalTimingMap, ExportProgress } from '@/services/audio/AudioExporter';
import type { TextSegment } from '@/services/segmentation';
import { SEEK_STEP_SECONDS } from '@/utils/constants';

interface FullAudioViewProps {
  projectId: string;
  projectTitle: string;
  originalContent: string;
  /** Reader segments. When all of them already have audio, it is reused, not regenerated. */
  segments?: TextSegment[];
  /** Callback when user wants to exit full audio mode */
  onClose: () => void;
  /** Callback for errors */
  onError?: (message: string) => void;
}

/**
 * FullAudioView provides a dedicated view for full audiobook playback.
 * Features:
 * - Plays concatenated audio as a single track
 * - Word-level highlighting during playback
 * - Click-to-seek functionality
 * - Full progress bar with seek
 */
export function FullAudioView({
  projectId,
  projectTitle,
  originalContent,
  segments,
  onClose,
  onError,
}: FullAudioViewProps) {
  const { state, actions, timingMap } = useFullAudioPlayer();
  const getTTSProvider = useTTSProvider();
  const settings = useSettingsState();
  const [localTimingMap, setLocalTimingMap] = useState<GlobalTimingMap | null>(null);
  const [generationProgress, setGenerationProgress] = useState<ExportProgress | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  // Entering Full Audio Mode is a request to listen: play once the audio is ready.
  const autoplayPendingRef = useRef(true);

  // Generate and load full audio on mount
  useEffect(() => {
    let cancelled = false;
    const abort = new AbortController();

    async function generateAndLoad() {
      setIsGenerating(true);
      setGenerationProgress({
        phase: 'loading',
        current: 0,
        total: 1,
        message: 'Preparing full audio...',
      });

      try {
        // Get TTS provider and voice
        const provider = getTTSProvider();
        const voiceId = settings.defaultVoiceId || '';

        const exporter = getAudioExporter();
        const onProgress = (progress: ExportProgress) => {
          if (!cancelled) {
            setGenerationProgress(progress);
          }
        };
        const cacheFilter = { provider: settings.defaultProvider, voiceId };
        // Reuse the segment audio the reader already made; generate only when some is missing.
        const reuse = !!segments && await exporter.hasAllSegmentAudio(projectId, segments, cacheFilter);
        if (cancelled) return;
        const result = reuse
          ? await exporter.exportFullAudio(projectId, segments!, { format: 'wav', onProgress, cacheFilter })
          : await exporter.generateFullAudio(projectId, originalContent, provider, voiceId, {
              format: 'wav',
              onProgress,
              signal: abort.signal,
            });

        if (cancelled) return;

        setLocalTimingMap(result.timingMap);
        await actions.load(result.blob, result.timingMap);
        setIsGenerating(false);
        setGenerationProgress(null);
      } catch (error) {
        if (cancelled) return;
        setIsGenerating(false);
        setGenerationProgress(null);
        const message = error instanceof Error ? error.message : 'Failed to generate full audio';
        setGenerationError(message);
        onError?.(message);
      }
    }

    generateAndLoad();

    return () => {
      cancelled = true;
      abort.abort();
      actions.unload();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]); // Only regenerate if project changes

  // Autoplay once, when the generated or reused audio has loaded.
  useEffect(() => {
    if (state.isLoaded && autoplayPendingRef.current) {
      autoplayPendingRef.current = false;
      actions.play();
    }
  }, [state.isLoaded, actions]);

  // Handle seek from text click
  const handleSeek = useCallback((globalTime: number) => {
    actions.seek(globalTime);
  }, [actions]);

  // Progress bar click handler
  const handleProgressClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const percent = (e.clientX - rect.left) / rect.width;
    const newTime = percent * state.duration;
    actions.seek(newTime);
  }, [state.duration, actions]);

  const handleSeekBackward = useCallback(() => actions.seek(state.currentTime - SEEK_STEP_SECONDS), [actions, state.currentTime]);
  const handleSeekForward = useCallback(() => actions.seek(state.currentTime + SEEK_STEP_SECONDS), [actions, state.currentTime]);
  const handleMuteToggle = useCallback(() => actions.setVolume(state.volume > 0 ? 0 : 1), [actions, state.volume]);
  const handleVolumeChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => actions.setVolume(parseFloat(e.target.value)), [actions]);
  const handleSpeedChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => actions.setPlaybackRate(parseFloat(e.target.value)), [actions]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          actions.togglePlay();
          break;
        case 'ArrowLeft':
          e.preventDefault();
          actions.seek(state.currentTime - SEEK_STEP_SECONDS);
          break;
        case 'ArrowRight':
          e.preventDefault();
          actions.seek(state.currentTime + SEEK_STEP_SECONDS);
          break;
        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [actions, state.currentTime, onClose]);

  // Loading state
  if (isGenerating || state.isLoading) {
    return (
      <div className="flex flex-col h-full bg-surface">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-surface-light">
          <button
            onClick={onClose}
            aria-label="Close Full Audio Mode"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-text-primary">Full Audio Mode</h1>
            <p className="text-sm text-text-muted">{projectTitle}</p>
          </div>
        </header>

        {/* Loading content */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-12 h-12 text-primary animate-spin" aria-hidden="true" />
          <p className="text-text-secondary text-lg" role="status" aria-live="polite">
            {generationProgress?.message || 'Preparing full audio...'}
          </p>
          {generationProgress && (
            <div className="w-64">
              <div className="h-2 bg-surface-light rounded-full overflow-hidden">
                <div
                  className="h-full bg-primary transition-all"
                  style={{
                    width: `${(generationProgress.current / generationProgress.total) * 100}%`,
                  }}
                />
              </div>
              <p className="text-sm text-text-muted text-center mt-2">
                {generationProgress.current} / {generationProgress.total}
              </p>
            </div>
          )}
          <button
            onClick={onClose}
            className="px-4 py-2 border border-surface-light text-text-primary rounded-lg hover:bg-surface-light transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Error state (from generation or playback)
  const errorMessage = generationError || state.error;
  if (errorMessage) {
    return (
      <div className="flex flex-col h-full bg-surface">
        {/* Header */}
        <header className="flex items-center gap-4 px-6 py-4 border-b border-surface-light">
          <button
            onClick={onClose}
            aria-label="Close Full Audio Mode"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          >
            <X className="w-5 h-5" aria-hidden="true" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-semibold text-text-primary">Full Audio Mode</h1>
            <p className="text-sm text-text-muted">{projectTitle}</p>
          </div>
        </header>

        {/* Error content */}
        <div className="flex-1 flex flex-col items-center justify-center gap-4 p-6">
          <AlertCircle className="w-12 h-12 text-error" />
          <p className="text-text-secondary text-lg text-center max-w-md">{errorMessage}</p>
          <p className="text-text-muted text-sm text-center max-w-md">
            Check your TTS provider settings and try again.
          </p>
          <button
            onClick={onClose}
            className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary-light transition-colors"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const effectiveTimingMap = localTimingMap || timingMap;

  return (
    <div ref={containerRef} className="flex flex-col h-full bg-surface">
      {/* Header */}
      <header className="flex items-center gap-4 px-6 py-4 border-b border-surface-light">
        <button
          onClick={onClose}
          className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          title="Exit Full Audio Mode (Esc)"
          aria-label="Close Full Audio Mode"
        >
          <X className="w-5 h-5" aria-hidden="true" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-semibold text-text-primary">Full Audio Mode</h1>
          <p className="text-sm text-text-muted">
            {projectTitle} • {formatTime(state.duration)} total
          </p>
        </div>
        <div className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-sm font-medium">
          Full Audio
        </div>
      </header>

      {/* Main Content - Scrollable text area */}
      <main className="flex-1 overflow-auto p-6">
        <RawTextView
          originalContent={originalContent}
          timingMap={effectiveTimingMap || undefined}
          currentGlobalTime={state.currentTime}
          isFullAudioMode={true}
          onSeek={handleSeek}
        />
      </main>

      {/* Audio Player Bar */}
      <footer className="border-t border-surface-light bg-surface-dark px-6 py-4">
        <div className="max-w-3xl mx-auto">
          {/* Progress Bar */}
          <div className="flex items-center gap-3 mb-4">
            <span className="text-xs text-text-muted w-16 text-right tabular-nums">
              {formatTime(state.currentTime)}
            </span>
            <div
              className="flex-1 h-2 bg-surface-light rounded-full cursor-pointer group"
              onClick={handleProgressClick}
            >
              <div
                className="h-full bg-primary rounded-full transition-all relative"
                style={{
                  width: `${state.duration > 0 ? (state.currentTime / state.duration) * 100 : 0}%`,
                }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
              </div>
            </div>
            <span className="text-xs text-text-muted w-16 tabular-nums">
              {formatTime(state.duration)}
            </span>
          </div>

          {/* Current position indicator */}
          {effectiveTimingMap && state.currentSegmentIndex >= 0 && (
            <div className="text-center text-xs text-text-muted mb-3">
              Segment {state.currentSegmentIndex + 1} of {effectiveTimingMap.segments.length}
            </div>
          )}

          {/* Controls */}
          <div className="flex items-center justify-center gap-4">
            <button
              onClick={handleSeekBackward}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
              title={`Seek backward ${SEEK_STEP_SECONDS} s`}
              aria-label={`Seek backward ${SEEK_STEP_SECONDS} seconds`}
            >
              <SkipBack className="w-5 h-5" />
            </button>

            <button
              onClick={actions.togglePlay}
              className="p-4 bg-primary hover:bg-primary-light rounded-full transition-colors"
              title={state.isPlaying ? 'Pause' : 'Play'}
              aria-label={state.isPlaying ? 'Pause' : 'Play'}
            >
              {state.isPlaying ? (
                <Pause className="w-6 h-6 text-on-primary" />
              ) : (
                <Play className="w-6 h-6 text-on-primary ml-0.5" />
              )}
            </button>

            <button
              onClick={handleSeekForward}
              className="p-2 text-text-secondary hover:text-text-primary transition-colors"
              title={`Seek forward ${SEEK_STEP_SECONDS} s`}
              aria-label={`Seek forward ${SEEK_STEP_SECONDS} seconds`}
            >
              <SkipForward className="w-5 h-5" />
            </button>

            {/* Speed Control */}
            <select
              value={state.playbackSpeed}
              onChange={handleSpeedChange}
              aria-label="Playback speed"
              className="ml-4 px-2 py-1 bg-surface-light text-text-secondary text-sm rounded-lg"
            >
              <option value="0.5">0.5x</option>
              <option value="0.75">0.75x</option>
              <option value="1">1x</option>
              <option value="1.25">1.25x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>

            {/* Volume */}
            <div className="flex items-center gap-2 ml-4">
              <button
                onClick={handleMuteToggle}
                className="p-1 text-text-muted hover:text-text-primary transition-colors"
                title={state.volume > 0 ? 'Mute' : 'Unmute'}
                aria-label={state.volume > 0 ? 'Mute' : 'Unmute'}
              >
                {state.volume > 0 ? (
                  <Volume2 className="w-4 h-4" />
                ) : (
                  <VolumeX className="w-4 h-4" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={state.volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
                className="w-20 h-1 bg-surface-light rounded-full appearance-none cursor-pointer
                           [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                           [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
              />
            </div>
          </div>

          {/* Keyboard shortcuts hint */}
          <div className="text-center text-xs text-text-muted mt-3">
            Space: Play/Pause • ←/→: Seek {SEEK_STEP_SECONDS}s • Esc: Exit
          </div>
        </div>
      </footer>
    </div>
  );
}

export default FullAudioView;
