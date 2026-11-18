import { useState } from 'react';
import { Play, Pause, Loader2 } from 'lucide-react';
import { FullScreenPlayer } from './FullScreenPlayer';

const SAFE_AREA_BOTTOM_STYLE = { paddingBottom: 'var(--safe-area-bottom)' } as const;

interface MobilePlayerProps {
  // Playback state
  isPlaying: boolean;
  isLoading: boolean;
  currentTime: number;
  duration: number;
  speed: number;
  volume: number;
  isMuted: boolean;
  // Segment info
  segmentTitle: string;
  segmentIndex: number;
  totalSegments: number;
  projectTitle: string;
  // Handlers
  onPlayPause: () => void;
  onSeek: (time: number) => void;
  onSpeedChange: (speed: number) => void;
  onVolumeChange: (volume: number) => void;
  onMuteToggle: () => void;
  onPrevSegment: () => void;
  onNextSegment: () => void;
  onSeekBackward: () => void;
  onSeekForward: () => void;
}

export function MobilePlayer({
  isPlaying,
  isLoading,
  currentTime,
  duration,
  speed,
  volume,
  isMuted,
  segmentTitle,
  segmentIndex,
  totalSegments,
  projectTitle,
  onPlayPause,
  onSeek,
  onSpeedChange,
  onVolumeChange,
  onMuteToggle,
  onPrevSegment,
  onNextSegment,
  onSeekBackward,
  onSeekForward,
}: MobilePlayerProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  return (
    <>
      {/* Mini player bar */}
      <div
        className="fixed bottom-0 inset-x-0 bg-surface-dark border-t border-surface-light z-40"
        style={SAFE_AREA_BOTTOM_STYLE}
      >
        {/* Progress bar at top of mini player */}
        <div className="h-0.5 bg-surface-light">
          <div
            className="h-full bg-primary transition-[width] duration-100"
            style={{ width: `${progress}%` }}
          />
        </div>

        <div className="flex items-center h-14 px-4 gap-3">
          {/* Expand trigger: a real button beside (not around) the play button */}
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className="flex flex-1 min-w-0 items-center gap-3 text-left"
          >
            <span className="w-10 h-10 rounded-lg bg-surface-light flex items-center justify-center flex-shrink-0" aria-hidden="true">
              <span className="text-lg">🎧</span>
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-sm font-medium text-text-primary truncate">{segmentTitle}</span>
              <span className="block text-xs text-text-muted truncate">
                Segment {segmentIndex + 1} of {totalSegments}
              </span>
              <span className="sr-only">. Open the full player.</span>
            </span>
          </button>

          {/* Play/pause button */}
          <button
            onClick={onPlayPause}
            disabled={isLoading}
            className="touch-target text-text-primary hover:text-primary transition-colors"
            aria-label={isLoading ? 'Preparing audio' : isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 className="w-7 h-7 animate-spin" aria-hidden="true" />
            ) : isPlaying ? (
              <Pause className="w-7 h-7" />
            ) : (
              <Play className="w-7 h-7" />
            )}
          </button>
        </div>
      </div>

      {/* Full screen player overlay */}
      <FullScreenPlayer
        isOpen={isExpanded}
        onClose={() => setIsExpanded(false)}
        isPlaying={isPlaying}
        isLoading={isLoading}
        currentTime={currentTime}
        duration={duration}
        speed={speed}
        volume={volume}
        isMuted={isMuted}
        segmentTitle={segmentTitle}
        segmentIndex={segmentIndex}
        totalSegments={totalSegments}
        projectTitle={projectTitle}
        onPlayPause={onPlayPause}
        onSeek={onSeek}
        onSpeedChange={onSpeedChange}
        onVolumeChange={onVolumeChange}
        onMuteToggle={onMuteToggle}
        onPrevSegment={onPrevSegment}
        onNextSegment={onNextSegment}
        onSeekBackward={onSeekBackward}
        onSeekForward={onSeekForward}
      />
    </>
  );
}
