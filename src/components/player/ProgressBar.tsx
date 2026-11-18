import { memo, useRef, useState, useCallback } from 'react';
import { formatTime } from '@/utils/formatTime';

interface ProgressBarProps {
  currentTime: number;
  duration: number;
  onSeek: (time: number) => void;
  disabled?: boolean;
}

export const ProgressBar = memo(function ProgressBar({
  currentTime,
  duration,
  onSeek,
  disabled = false,
}: ProgressBarProps) {
  const progressRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [hoverTime, setHoverTime] = useState<number | null>(null);

  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;

  const calculateTime = useCallback(
    (clientX: number): number => {
      if (!progressRef.current || duration <= 0) return 0;

      const rect = progressRef.current.getBoundingClientRect();
      const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
      return (x / rect.width) * duration;
    },
    [duration]
  );

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;

    setIsDragging(true);
    const time = calculateTime(e.clientX);
    onSeek(time);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    const time = calculateTime(e.clientX);
    setHoverTime(time);

    if (isDragging) {
      onSeek(time);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleMouseLeave = () => {
    setHoverTime(null);
    setIsDragging(false);
  };

  return (
    <div className="flex items-center gap-3 w-full">
      <span className="text-xs text-text-muted w-10 text-right tabular-nums">
        {formatTime(currentTime)}
      </span>

      <div
        ref={progressRef}
        className={`relative flex-1 h-2 bg-surface-light rounded-full cursor-pointer group ${
          disabled ? 'opacity-50 cursor-not-allowed' : ''
        }`}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        role="slider"
        aria-label="Playback progress"
        aria-valuemin={0}
        aria-valuemax={duration}
        aria-valuenow={currentTime}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(duration)}`}
      >
        {/* Progress fill */}
        <div
          className="absolute h-full bg-primary rounded-full transition-all"
          style={{ width: `${progress}%` }}
        />

        {/* Hover indicator */}
        {hoverTime !== null && !disabled && (
          <div
            className="absolute h-full bg-primary/30 rounded-full"
            style={{
              width: `${(hoverTime / duration) * 100}%`,
            }}
          />
        )}

        {/* Thumb */}
        <div
          className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-md
                      transform -translate-x-1/2 transition-opacity
                      ${disabled ? 'opacity-0' : 'opacity-0 group-hover:opacity-100'}`}
          style={{ left: `${progress}%` }}
        />

        {/* Hover time tooltip */}
        {hoverTime !== null && !disabled && (
          <div
            className="absolute -top-8 transform -translate-x-1/2 px-2 py-1
                       bg-surface-dark text-text-primary text-xs rounded pointer-events-none"
            style={{
              left: `${(hoverTime / duration) * 100}%`,
            }}
          >
            {formatTime(hoverTime)}
          </div>
        )}
      </div>

      <span className="text-xs text-text-muted w-10 tabular-nums">
        {formatTime(duration)}
      </span>
    </div>
  );
});
