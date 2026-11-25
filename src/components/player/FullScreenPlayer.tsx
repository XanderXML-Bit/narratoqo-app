import { useState, useRef, useCallback } from 'react';
import {
  X,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  RotateCcw,
  RotateCw,
  Loader2,
} from 'lucide-react';
import { SEEK_STEP_SECONDS } from '@/utils/constants';
import { SpeedSelector } from './SpeedSelector';
import { formatTime } from '@/utils/formatTime';

const SAFE_AREA_PADDING_STYLE = {
  paddingTop: 'var(--safe-area-top)',
  paddingBottom: 'var(--safe-area-bottom)',
} as const;

interface FullScreenPlayerProps {
  isOpen: boolean;
  onClose: () => void;
  // Playback state
  isPlaying: boolean;
  /** Audio for the current segment is being prepared. */
  isLoading?: boolean;
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

export function FullScreenPlayer({
  isOpen,
  onClose,
  isPlaying,
  isLoading = false,
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
}: FullScreenPlayerProps) {
  const [isSpeedSelectorOpen, setIsSpeedSelectorOpen] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const progressRef = useRef<HTMLDivElement>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  // Handle progress bar interaction
  const handleProgressChange = useCallback(
    (clientX: number) => {
      if (!progressRef.current || duration <= 0) return;

      const rect = progressRef.current.getBoundingClientRect();
      const x = clientX - rect.left;
      const percentage = Math.max(0, Math.min(1, x / rect.width));
      const newTime = percentage * duration;
      onSeek(newTime);
    },
    [duration, onSeek]
  );

  const handleTouchStart = (e: React.TouchEvent) => {
    setIsDragging(true);
    handleProgressChange(e.touches[0].clientX);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (isDragging) {
      handleProgressChange(e.touches[0].clientX);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    handleProgressChange(e.clientX);
  };

  if (!isOpen) return null;

  return (
    <div
      className={`fixed inset-0 ${isSpeedSelectorOpen ? 'z-60' : 'z-50'} bg-surface flex flex-col animate-slide-up`}
      style={SAFE_AREA_PADDING_STYLE}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onClose}
          className="touch-target text-text-secondary hover:text-text-primary"
          aria-label="Close player"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="text-center flex-1">
          <p className="text-xs text-text-muted uppercase tracking-wider">Now Playing</p>
        </div>
        <div className="w-11" /> {/* Spacer for symmetry */}
      </div>

      {/* Cover art placeholder */}
      <div className="flex-1 flex items-center justify-center px-8">
        <div className="w-full max-w-xs aspect-square bg-surface-light rounded-2xl flex items-center justify-center">
          <span className="text-6xl text-text-muted">🎧</span>
        </div>
      </div>

      {/* Info */}
      <div className="px-6 py-4 text-center">
        <h2 className="text-lg font-semibold text-text-primary truncate">{projectTitle}</h2>
        <p className="text-sm text-text-muted mt-1 truncate">{segmentTitle}</p>
        <p className="text-xs text-text-muted mt-1">
          Segment {segmentIndex + 1} of {totalSegments}
        </p>
      </div>

      {/* Progress bar */}
      <div className="px-6 py-4">
        <div
          ref={progressRef}
          className="h-2 bg-surface-light rounded-full cursor-pointer touch-none"
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onMouseDown={handleMouseDown}
          role="slider"
          aria-label="Playback progress"
          aria-valuemin={0}
          aria-valuemax={duration}
          aria-valuenow={currentTime}
          tabIndex={0}
        >
          <div
            className="h-full bg-primary rounded-full relative"
            style={{ width: `${progress}%` }}
          >
            {/* Thumb */}
            <div className="absolute right-0 top-1/2 -translate-y-1/2 w-4 h-4 bg-primary rounded-full shadow-lg" />
          </div>
        </div>
        <div className="flex justify-between mt-2 text-xs text-text-muted">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      {/* Main controls */}
      <div className="px-6 py-4">
        <div className="flex items-center justify-center gap-6">
          {/* Previous segment */}
          <button
            onClick={onPrevSegment}
            className="touch-target-lg text-text-secondary hover:text-text-primary"
            aria-label="Previous segment"
            disabled={segmentIndex === 0}
          >
            <SkipBack className="w-8 h-8" />
          </button>

          {/* Seek backward */}
          <button
            onClick={onSeekBackward}
            className="touch-target-lg text-text-secondary hover:text-text-primary"
            aria-label={`Rewind ${SEEK_STEP_SECONDS} seconds`}
          >
            <RotateCcw className="w-7 h-7" />
          </button>

          {/* Play/Pause */}
          <button
            onClick={onPlayPause}
            disabled={isLoading}
            className="w-16 h-16 flex items-center justify-center bg-primary hover:bg-primary-light disabled:opacity-60 rounded-full text-on-primary transition-colors"
            aria-label={isLoading ? 'Preparing audio' : isPlaying ? 'Pause' : 'Play'}
          >
            {isLoading ? (
              <Loader2 className="w-8 h-8 animate-spin" aria-hidden="true" />
            ) : isPlaying ? (
              <Pause className="w-8 h-8" />
            ) : (
              <Play className="w-8 h-8 ml-1" />
            )}
          </button>

          {/* Seek forward */}
          <button
            onClick={onSeekForward}
            className="touch-target-lg text-text-secondary hover:text-text-primary"
            aria-label={`Forward ${SEEK_STEP_SECONDS} seconds`}
          >
            <RotateCw className="w-7 h-7" />
          </button>

          {/* Next segment */}
          <button
            onClick={onNextSegment}
            className="touch-target-lg text-text-secondary hover:text-text-primary"
            aria-label="Next segment"
            disabled={segmentIndex === totalSegments - 1}
          >
            <SkipForward className="w-8 h-8" />
          </button>
        </div>
      </div>

      {/* Secondary controls */}
      <div className="px-6 py-4 flex items-center justify-between">
        {/* Speed */}
        <button
          onClick={(event) => {
            event.currentTarget.focus();
            setIsSpeedSelectorOpen(true);
          }}
          className="touch-target px-3 py-2 bg-surface-light rounded-lg text-text-secondary hover:text-text-primary"
          aria-label={`Playback speed: ${speed}x`}
          aria-haspopup="dialog"
        >
          <span className="font-medium">{speed}x</span>
        </button>

        {/* Volume */}
        <div className="flex items-center gap-3">
          <button
            onClick={onMuteToggle}
            className="touch-target text-text-secondary hover:text-text-primary"
            aria-label={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-6 h-6" />
            ) : (
              <Volume2 className="w-6 h-6" />
            )}
          </button>
          <input
            type="range"
            min="0"
            max="1"
            step="0.01"
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            className="w-24 h-2 bg-surface-light rounded-full appearance-none cursor-pointer
              [&::-webkit-slider-thumb]:appearance-none
              [&::-webkit-slider-thumb]:w-4
              [&::-webkit-slider-thumb]:h-4
              [&::-webkit-slider-thumb]:bg-primary
              [&::-webkit-slider-thumb]:rounded-full"
            aria-label="Volume"
          />
        </div>
      </div>

      {/* Speed selector bottom sheet */}
      <SpeedSelector
        isOpen={isSpeedSelectorOpen}
        onClose={() => setIsSpeedSelectorOpen(false)}
        currentSpeed={speed}
        onSpeedChange={onSpeedChange}
      />
    </div>
  );
}
