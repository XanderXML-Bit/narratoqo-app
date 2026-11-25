import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  Loader2,
  VolumeX,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  FileText,
} from 'lucide-react';
import { formatTime } from '@/utils/formatTime';
import { useProjectState, usePlayerState, usePlayerActions, useSettingsState, useUIActions } from '@/stores';
import { useDeviceDetection } from '@/hooks';
import { ResponsiveProjectHeader } from '@/components/layout/ResponsiveProjectHeader';
import { MobilePlayer } from '@/components/player/MobilePlayer';
import { getAudioPlayer } from '@/services/audio';
import { hasReadableText } from '@/services/segmentation';
import { useMediaSession, updateMediaSessionState, updateMediaSessionPosition } from '@/hooks';
import { ExportModal } from '@/components/export';
import { FullAudioView } from '@/components/FullAudioView';
import { ViewErrorBoundary } from '@/components/ErrorBoundary';
import { HighlightedText, ContinuousHighlightedText } from '@/components/text/HighlightedText';
import { useProjectLoader } from '@/hooks/useProjectLoader';
import { PROVIDER_LABELS } from '@/services/tts/providerDefaults';
import { KokoroProvider } from '@/services/tts/KokoroProvider';
import { PiperProvider } from '@/services/tts/PiperProvider';
import { OnDeviceNotice } from '@/components/common/OnDeviceNotice';
import { OfflineBanner } from '@/components/common/OfflineBanner';
import { SiteFooter } from '@/components/layout/SiteFooter';
import { useAudioGeneration } from '@/hooks/useAudioGeneration';
import { useSegmentPlayback, SEEK_STEP_SECONDS } from '@/hooks/useSegmentPlayback';


export function Project() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const { currentProject } = useProjectState();
  const playerState = usePlayerState();
  const playerActions = usePlayerActions();
  const settings = useSettingsState();
  const { addToast, setSettingsOpen } = useUIActions();
  const { isMobile } = useDeviceDetection();

  // Layout state
  const [isPaginated, setIsPaginated] = useState(false);
  const [viewMode, setViewMode] = useState<'segmented' | 'continuous'>('segmented');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [fullAudioMode, setFullAudioMode] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);

  const textContentRef = useRef<HTMLDivElement>(null);
  const segmentRefs = useRef<Map<number, HTMLElement>>(new Map());
  const audioPlayer = getAudioPlayer();

  // Hook 1: Load project and segment text
  const { segments, pages, initialAudioStatus } = useProjectLoader(id);

  // Hook 2: Audio generation with caching and deduplication
  const { generateSegmentAudio, preloadNextSegments, cancelPreloads, segmentAudioStatus, generatingSegmentIndex } =
    useAudioGeneration(segments, initialAudioStatus);

  // Hook 3: Segment playback and navigation
  const {
    currentSegmentIndex,
    currentWordIndex,
    currentTiming,
    autoRead,
    isPreparing,
    preparingSegmentIndex,
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
    setSuspended: setReaderSuspended,
  } = useSegmentPlayback(segments, generateSegmentAudio, preloadNextSegments, {
    isPaginated,
    currentPage,
    onPageChange: setCurrentPage,
  }, cancelPreloads);

  // The sample-chapter button navigates here with { autoplay: true }; that click
  // is the user gesture, so start playback once the segments are ready.
  const location = useLocation();
  const autoplayDoneRef = useRef(false);
  useEffect(() => {
    const wantsAutoplay = (location.state as { autoplay?: boolean } | null)?.autoplay === true;
    if (!wantsAutoplay || autoplayDoneRef.current || segments.length === 0 || !currentProject) return;
    autoplayDoneRef.current = true;
    navigate(location.pathname, { replace: true, state: null });
    void handlePlayPause();
  }, [location.state, location.pathname, segments.length, currentProject, handlePlayPause, navigate]);

  // Page title names the project.
  useEffect(() => {
    if (!currentProject) return;
    const previous = document.title;
    document.title = `${currentProject.title} · Narratoqo`;
    return () => { document.title = previous; };
  }, [currentProject]);

  // Keyboard: Space plays or pauses, Left and Right seek. Ignored while typing or when a
  // control has focus (Space activates the focused control instead).
  useEffect(() => {
    if (fullAudioMode) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest('input, textarea, select, button, a, [role="button"], [role="dialog"], [contenteditable="true"]')) return;
      if (e.code === 'Space') {
        e.preventDefault();
        void handlePlayPause();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        handleSeekBackward();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleSeekForward();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [fullAudioMode, handlePlayPause, handleSeekBackward, handleSeekForward]);

  // Auto-scroll to current segment
  useEffect(() => {
    if (!isPaginated && segmentRefs.current.has(currentSegmentIndex)) {
      const segmentEl = segmentRefs.current.get(currentSegmentIndex);
      if (segmentEl) {
        segmentEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentSegmentIndex, isPaginated]);

  const providerName = PROVIDER_LABELS[settings.defaultProvider] || settings.defaultProvider;
  const voiceName =
    [...KokoroProvider.VOICES, ...PiperProvider.VOICES].find((v) => v.id === settings.defaultVoiceId)?.name.split(' (')[0] ||
    settings.defaultVoiceId ||
    'Default';

  const handleBack = useCallback(() => navigate('/'), [navigate]);
  const handleTogglePaginated = useCallback(() => setIsPaginated(prev => !prev), []);
  const handleToggleViewMode = useCallback(
    () => setViewMode(prev => prev === 'segmented' ? 'continuous' : 'segmented'),
    []
  );
  // Full Audio Mode has its own player. Stop the reader first so only one voice plays;
  // on return the reader stays stopped on the same segment until Play is pressed.
  const handleOpenFullAudio = useCallback(() => {
    setReaderSuspended(true);
    setFullAudioMode(true);
  }, [setReaderSuspended]);
  const handleOpenExport = useCallback(() => setExportModalOpen(true), []);
  const handleOpenSettings = useCallback(() => setSettingsOpen(true), [setSettingsOpen]);
  const handleCloseFullAudio = useCallback(() => {
    setFullAudioMode(false);
    setReaderSuspended(false);
  }, [setReaderSuspended]);
  const handleFullAudioError = useCallback((message: string) => addToast({ type: 'error', message }), [addToast]);
  const handleCloseExport = useCallback(() => setExportModalOpen(false), []);

  const segmentProgress = useMemo(() => {
    if (currentSegmentIndex < 0 || playerState.totalDuration <= 0) {
      return { progress: 0, current: 0, total: 0 };
    }
    const progress = (playerState.currentTime / playerState.totalDuration) * 100;
    return {
      progress: Math.min(100, progress),
      current: playerState.currentTime,
      total: playerState.totalDuration,
    };
  }, [currentSegmentIndex, playerState.currentTime, playerState.totalDuration]);

  const exportAudioStatus = useMemo(() => {
    const result: Record<number, boolean> = {};
    for (const [key, value] of Object.entries(segmentAudioStatus)) {
      result[parseInt(key, 10)] = value === 'ready';
    }
    return result;
  }, [segmentAudioStatus]);

  const displaySegments = isPaginated
    ? (pages[currentPage]?.segments || [])
    : segments;

  const handlePageChange = (newPage: number) => {
    if (newPage >= 0 && newPage < pages.length) {
      setCurrentPage(newPage);
    }
  };

  // Media Session
  useMediaSession(
    currentProject
      ? {
          title: currentProject.title,
          artist: 'Narratoqo',
          album: `Segment ${currentSegmentIndex + 1} of ${segments.length}`,
          onPlay: handlePlayPause,
          onPause: () => audioPlayer.pause(),
          onSeekBackward: handleSeekBackward,
          onSeekForward: handleSeekForward,
          onSeekTo: (time) => audioPlayer.seek(time),
        }
      : null
  );

  useEffect(() => {
    updateMediaSessionState(playerState.isPlaying ? 'playing' : 'paused');
  }, [playerState.isPlaying]);

  useEffect(() => {
    if (playerState.totalDuration > 0) {
      updateMediaSessionPosition(
        playerState.totalDuration,
        playerState.currentTime,
        playerState.playbackSpeed
      );
    }
  }, [playerState.currentTime, playerState.totalDuration, playerState.playbackSpeed]);

  if (!currentProject) {
    return (
      <div className="flex items-center justify-center h-screen bg-surface" role="status" aria-label="Loading project">
        <Loader2 className="w-8 h-8 text-primary animate-spin" aria-hidden="true" />
      </div>
    );
  }

  if (fullAudioMode) {
    return (
      <ViewErrorBoundary viewName="Full Audio">
        <OfflineBanner />
        <FullAudioView
          projectId={id || ''}
          segments={segments}
          projectTitle={currentProject.title}
          originalContent={currentProject.originalContent}
          onClose={handleCloseFullAudio}
          onError={handleFullAudioError}
        />
      </ViewErrorBoundary>
    );
  }

  return (
    <div className={`flex flex-col bg-surface ${isMobile ? 'min-h-screen' : 'h-screen'}`}>
      {/* Responsive Header */}
      <ResponsiveProjectHeader
        title={currentProject.title}
        segmentCount={segments.length}
        currentSegmentIndex={currentSegmentIndex}
        currentPage={currentPage}
        pageCount={pages.length}
        isPaginated={isPaginated}
        onBack={handleBack}
        providerName={providerName}
        voiceName={voiceName}
        onTogglePaginated={handleTogglePaginated}
        viewMode={viewMode}
        onToggleViewMode={handleToggleViewMode}
        autoRead={autoRead}
        onToggleAutoRead={handleAutoReadToggle}
        onFullAudioMode={handleOpenFullAudio}
        onExport={handleOpenExport}
        onSettings={handleOpenSettings}
        isGenerating={generatingSegmentIndex !== null}
        hasSegments={segments.length > 0}
      />

      {/* Main Content */}
      <main
        className={`flex-1 overflow-auto p-4 sm:p-6 ${isMobile ? 'pt-16 pb-20' : ''}`}
        ref={textContentRef}
      >
        <OfflineBanner className="max-w-3xl mx-auto mb-4 rounded-lg" />
        <OnDeviceNotice className="max-w-3xl mx-auto mb-4" />
        {segments.length === 0 ? (
          <div className="max-w-3xl mx-auto flex flex-col items-center justify-center py-16 text-center">
            <FileText className="w-12 h-12 text-text-muted mb-4" />
            <h3 className="text-lg font-semibold text-text-primary mb-2">No segments found</h3>
            <p className="text-sm text-text-secondary max-w-md mb-6">
              This project doesn't have any text segments to narrate. The content may be empty or couldn't be parsed into segments.
            </p>
            <button
              onClick={() => navigate('/')}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 transition-colors"
            >
              Back to Projects
            </button>
          </div>
        ) : viewMode === 'continuous' ? (
          /* Continuous Reading View */
          <div className="max-w-3xl mx-auto">
            <div className="prose prose-lg prose-invert max-w-none leading-relaxed text-text-primary">
              {displaySegments.map((segment, idx) => {
                const isCurrentSegment = segment.index === currentSegmentIndex;
                const isNonReadable = !hasReadableText(segment.text);

                return (
                  <span
                    key={segment.id}
                    ref={(el) => {
                      if (el) segmentRefs.current.set(segment.index, el);
                    }}
                    onClick={() => handleSegmentClick(segment.index)}
                    className={`cursor-pointer transition-colors duration-200 ${
                      isCurrentSegment
                        ? 'bg-primary/20 rounded px-1 -mx-1'
                        : isNonReadable
                          ? 'text-text-muted/50'
                          : 'hover:bg-surface-light/50'
                    }`}
                  >
                    {isCurrentSegment && currentTiming && currentTiming.length > 0 ? (
                      <ContinuousHighlightedText
                        timing={currentTiming}
                        currentWordIndex={currentWordIndex}
                        onWordClick={(localIdx, timing) => handleWordClick(localIdx, timing)}
                      />
                    ) : (
                      segment.text
                    )}
                    {idx < displaySegments.length - 1 && (
                      segment.type === 'paragraph' ? '\n\n' : ' '
                    )}
                  </span>
                );
              })}
            </div>
            <div className="fixed bottom-24 right-6 bg-surface-dark/90 backdrop-blur-sm rounded-lg px-3 py-2 text-sm text-text-muted shadow-lg">
              Segment {currentSegmentIndex + 1} of {segments.length}
              {(generatingSegmentIndex !== null || isPreparing) && (
                <Loader2 className="inline-block ml-2 w-3 h-3 animate-spin" aria-hidden="true" />
              )}
            </div>
          </div>
        ) : (
          /* Segmented View */
          <div className="max-w-3xl mx-auto space-y-4">
            {displaySegments.map((segment) => {
              const isCurrentSegment = segment.index === currentSegmentIndex;
              const segmentStatus = segmentAudioStatus[segment.index] || 'idle';
              const isGeneratingThis = generatingSegmentIndex === segment.index || preparingSegmentIndex === segment.index;
              const isNonReadable = !hasReadableText(segment.text);

              return (
                <div
                  key={segment.id}
                  ref={(el) => {
                    if (el) segmentRefs.current.set(segment.index, el);
                  }}
                  onClick={() => handleSegmentClick(segment.index)}
                  className={`relative p-4 rounded-xl cursor-pointer transition-all ${
                    isCurrentSegment
                      ? 'bg-primary/10 ring-2 ring-primary'
                      : isNonReadable
                        ? 'bg-surface-light/50 opacity-50'
                        : 'bg-surface-light hover:bg-surface-dark'
                  }`}
                >
                  <div className="absolute top-2 right-2 flex items-center gap-2">
                    {isGeneratingThis && (
                      <Loader2 className="w-3 h-3 text-primary animate-spin" />
                    )}
                    {segmentStatus === 'ready' && !isGeneratingThis && (
                      <CheckCircle className="w-3 h-3 text-success" />
                    )}
                    {isNonReadable && (
                      <span className="text-xs text-text-muted italic">no audio</span>
                    )}
                    <span className="text-xs text-text-muted">#{segment.index + 1}</span>
                  </div>

                  {isCurrentSegment && currentTiming && currentTiming.length > 0 ? (
                    <HighlightedText
                      timing={currentTiming}
                      currentWordIndex={currentWordIndex}
                      onWordClick={(localIdx, timing) => handleWordClick(localIdx, timing)}
                    />
                  ) : (
                    <p className={`text-base leading-relaxed pr-8 ${
                      isCurrentSegment ? 'text-text-primary' : 'text-text-secondary'
                    }`}>
                      {segment.text}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <SiteFooter className="mt-10 -mx-4 sm:-mx-6 border-t-0" />
      </main>

      {/* Page Navigation */}
      {isPaginated && pages.length > 1 && (
        <div className="flex items-center justify-center gap-4 py-3 border-t border-surface-light bg-surface-dark">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 0}
            aria-label="Previous page"
            className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2">
            {pages.map((_, idx) => (
              <button
                key={idx}
                onClick={() => handlePageChange(idx)}
                aria-label={`Go to page ${idx + 1}`}
                aria-current={idx === currentPage ? 'page' : undefined}
                className={`w-8 h-8 rounded-lg text-sm font-medium transition-colors ${
                  idx === currentPage
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-light text-text-secondary hover:bg-surface'
                }`}
              >
                {idx + 1}
              </button>
            ))}
          </div>

          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === pages.length - 1}
            aria-label="Next page"
            className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Announces the preparing state on every layout: desktop footer, phone mini and full-screen player. */}
      <p role="status" aria-live="polite" className="sr-only" data-testid="preparing-status">
        {isPreparing && preparingSegmentIndex !== null
          ? `Preparing audio for segment ${preparingSegmentIndex + 1} of ${segments.length}`
          : ''}
      </p>

      {/* Audio Player */}
      {isMobile ? (
        <MobilePlayer
          isPlaying={playerState.isPlaying}
          isLoading={isPreparing}
          currentTime={playerState.currentTime}
          duration={playerState.totalDuration}
          speed={playerState.playbackSpeed}
          volume={playerState.volume}
          isMuted={playerState.volume === 0}
          segmentTitle={segments[currentSegmentIndex]?.text.slice(0, 50) || 'Loading...'}
          segmentIndex={currentSegmentIndex}
          totalSegments={segments.length}
          projectTitle={currentProject.title}
          onPlayPause={handlePlayPause}
          onSeek={handleSeek}
          onSpeedChange={handleSpeedChange}
          onVolumeChange={handleVolumeChange}
          onMuteToggle={handleMuteToggle}
          onPrevSegment={handlePrevSegment}
          onNextSegment={handleNextSegment}
          onSeekBackward={handleSeekBackward}
          onSeekForward={handleSeekForward}
        />
      ) : (
        <footer className="border-t border-surface-light bg-surface-dark px-6 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-xs text-text-muted w-10 text-right tabular-nums">
                {formatTime(playerState.currentTime)}
              </span>
              <div
                className="flex-1 h-2 bg-surface-light rounded-full cursor-pointer group"
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  const percent = (e.clientX - rect.left) / rect.width;
                  audioPlayer.seek(percent * playerState.totalDuration);
                }}
              >
                <div
                  className="h-full bg-primary rounded-full transition-all relative"
                  style={{
                    width: `${playerState.totalDuration > 0 ? (playerState.currentTime / playerState.totalDuration) * 100 : 0}%`,
                  }}
                >
                  <div className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 bg-white rounded-full shadow opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>
              </div>
              <span className="text-xs text-text-muted w-10 tabular-nums">
                {formatTime(playerState.totalDuration)}
              </span>
            </div>

            <div className="flex items-center gap-3 mb-4">
              <span className="text-xs text-accent w-10 text-right">Seg</span>
              <div className="flex-1 h-1.5 bg-surface-light rounded-full">
                <div
                  className="h-full bg-accent rounded-full transition-all"
                  style={{ width: `${segmentProgress.progress}%` }}
                />
              </div>
              <span className="text-xs text-accent w-10">
                {formatTime(segmentProgress.current)}/{formatTime(segmentProgress.total)}
              </span>
            </div>

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
                onClick={handlePlayPause}
                disabled={isPreparing}
                aria-label={isPreparing ? 'Preparing audio' : playerState.isPlaying ? 'Pause' : 'Play'}
                className="p-4 bg-primary hover:bg-primary-light disabled:opacity-50 rounded-full transition-colors"
              >
                {isPreparing ? (
                  <Loader2 className="w-6 h-6 text-on-primary animate-spin" />
                ) : playerState.isPlaying ? (
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

              <select
                value={playerState.playbackSpeed}
                onChange={(e) => {
                  const speed = parseFloat(e.target.value);
                  playerActions.setSpeed(speed);
                  audioPlayer.setPlaybackRate(speed);
                }}
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

              <div className="flex items-center gap-2 ml-4">
                <button
                  onClick={handleMuteToggle}
                  className="p-1 text-text-muted hover:text-text-primary transition-colors"
                  title={playerState.volume > 0 ? 'Mute' : 'Unmute'}
                  aria-label={playerState.volume > 0 ? 'Mute' : 'Unmute'}
                >
                  {playerState.volume > 0 ? (
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
                  value={playerState.volume}
                  onChange={(e) => handleVolumeChange(parseFloat(e.target.value))}
                  aria-label="Volume"
                  className="w-20 h-1 bg-surface-light rounded-full appearance-none cursor-pointer
                             [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                             [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
                />
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* Export Modal */}
      <ViewErrorBoundary viewName="Export">
      <ExportModal
        isOpen={exportModalOpen}
        onClose={handleCloseExport}
        projectId={id || ''}
        projectTitle={currentProject.title}
        segments={segments}
        segmentAudioStatus={exportAudioStatus}
      />
      </ViewErrorBoundary>
    </div>
  );
}
