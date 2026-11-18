import { memo } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX } from 'lucide-react';

interface PlaybackControlsProps {
  isPlaying: boolean;
  volume: number;
  onPlayPause: () => void;
  onSkipBack: () => void;
  onSkipForward: () => void;
  onVolumeChange: (volume: number) => void;
  disabled?: boolean;
}

export const PlaybackControls = memo(function PlaybackControls({
  isPlaying,
  volume,
  onPlayPause,
  onSkipBack,
  onSkipForward,
  onVolumeChange,
  disabled = false,
}: PlaybackControlsProps) {
  const isMuted = volume === 0;

  return (
    <div className="flex items-center gap-4">
      {/* Skip Back */}
      <button
        onClick={onSkipBack}
        disabled={disabled}
        className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Skip back 10 seconds"
        title="Skip back 10 seconds"
      >
        <SkipBack className="w-5 h-5" />
      </button>

      {/* Play/Pause */}
      <button
        onClick={onPlayPause}
        disabled={disabled}
        className="p-3 bg-primary hover:bg-primary-light disabled:opacity-50 disabled:cursor-not-allowed rounded-full transition-colors"
        aria-label={isPlaying ? 'Pause' : 'Play'}
      >
        {isPlaying ? (
          <Pause className="w-6 h-6 text-on-primary" />
        ) : (
          <Play className="w-6 h-6 text-on-primary ml-0.5" />
        )}
      </button>

      {/* Skip Forward */}
      <button
        onClick={onSkipForward}
        disabled={disabled}
        className="p-2 text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Skip forward 30 seconds"
        title="Skip forward 30 seconds"
      >
        <SkipForward className="w-5 h-5" />
      </button>

      {/* Volume */}
      <div className="flex items-center gap-2 ml-4">
        <button
          onClick={() => onVolumeChange(isMuted ? 1 : 0)}
          className="p-1 text-text-secondary hover:text-text-primary transition-colors"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? (
            <VolumeX className="w-5 h-5" />
          ) : (
            <Volume2 className="w-5 h-5" />
          )}
        </button>
        <input
          type="range"
          min="0"
          max="1"
          step="0.1"
          value={volume}
          onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
          className="w-20 h-1 bg-surface-light rounded-full appearance-none cursor-pointer
                     [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3
                     [&::-webkit-slider-thumb]:bg-primary [&::-webkit-slider-thumb]:rounded-full"
          aria-label="Volume"
        />
      </div>
    </div>
  );
});
