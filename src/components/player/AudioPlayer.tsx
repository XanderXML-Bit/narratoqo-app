import { PlaybackControls } from './PlaybackControls';
import { ProgressBar } from './ProgressBar';
import { SpeedControl } from './SpeedControl';
import { usePlayerState, usePlayerActions } from '@/stores';

interface AudioPlayerProps {
  onSeek?: (time: number) => void;
  onSkipBack?: () => void;
  onSkipForward?: () => void;
}

export function AudioPlayer({ onSeek, onSkipBack, onSkipForward }: AudioPlayerProps) {
  const {
    isPlaying,
    currentTime,
    totalDuration,
    playbackSpeed,
    volume,
    isBuffering,
  } = usePlayerState();

  const { togglePlay, setSpeed, setVolume, seek } = usePlayerActions();

  const handleSeek = (time: number) => {
    seek(time);
    onSeek?.(time);
  };

  const handleSkipBack = () => {
    const newTime = Math.max(0, currentTime - 10);
    handleSeek(newTime);
    onSkipBack?.();
  };

  const handleSkipForward = () => {
    const newTime = Math.min(totalDuration, currentTime + 30);
    handleSeek(newTime);
    onSkipForward?.();
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-surface-dark border-t border-surface-light px-6 py-4">
      <div className="max-w-4xl mx-auto">
        {/* Progress Bar */}
        <div className="mb-4">
          <ProgressBar
            currentTime={currentTime}
            duration={totalDuration}
            onSeek={handleSeek}
            disabled={totalDuration === 0}
          />
        </div>

        {/* Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <PlaybackControls
              isPlaying={isPlaying}
              volume={volume}
              onPlayPause={togglePlay}
              onSkipBack={handleSkipBack}
              onSkipForward={handleSkipForward}
              onVolumeChange={setVolume}
              disabled={totalDuration === 0}
            />

            {isBuffering && (
              <span className="text-xs text-text-muted animate-pulse">
                Buffering...
              </span>
            )}
          </div>

          <div className="flex items-center gap-4">
            <SpeedControl speed={playbackSpeed} onSpeedChange={setSpeed} />
          </div>
        </div>
      </div>
    </div>
  );
}
