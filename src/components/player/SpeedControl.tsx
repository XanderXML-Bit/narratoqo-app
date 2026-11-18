import { memo, useState, useRef, useEffect } from 'react';
import { SPEED_VALUES } from '@/utils/constants';

interface SpeedControlProps {
  speed: number;
  onSpeedChange: (speed: number) => void;
}

export const SpeedControl = memo(function SpeedControl({ speed, onSpeedChange }: SpeedControlProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const handleSpeedSelect = (newSpeed: number) => {
    onSpeedChange(newSpeed);
    setIsOpen(false);
  };

  return (
    <div className="relative" ref={menuRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="px-3 py-1.5 text-sm font-medium text-text-secondary hover:text-text-primary
                   bg-surface-light hover:bg-surface-dark rounded-lg transition-colors"
        aria-label={`Playback speed: ${speed}x`}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
      >
        {speed}x
      </button>

      {isOpen && (
        <div
          className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 py-2 min-w-[80px]
                     bg-surface-dark rounded-lg shadow-lg border border-surface-light"
          role="listbox"
        >
          {SPEED_VALUES.map((option) => (
            <button
              key={option}
              onClick={() => handleSpeedSelect(option)}
              className={`w-full px-4 py-1.5 text-sm text-left hover:bg-surface-light transition-colors
                         ${speed === option ? 'text-primary font-medium' : 'text-text-secondary'}`}
              role="option"
              aria-selected={speed === option}
            >
              {option}x
            </button>
          ))}
        </div>
      )}
    </div>
  );
});
