import { Check } from 'lucide-react';
import { BottomSheet } from '../common/BottomSheet';
import { SPEED_OPTIONS } from '@/utils/constants';

interface SpeedSelectorProps {
  isOpen: boolean;
  onClose: () => void;
  currentSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export function SpeedSelector({
  isOpen,
  onClose,
  currentSpeed,
  onSpeedChange,
}: SpeedSelectorProps) {
  const handleSelect = (speed: number) => {
    onSpeedChange(speed);
    onClose();
  };

  return (
    <BottomSheet isOpen={isOpen} onClose={onClose} title="Playback speed" maxHeight={60}>
      <div className="space-y-1">
        {SPEED_OPTIONS.map((option) => {
          const isSelected = Math.abs(currentSpeed - option.value) < 0.01;
          return (
            <button
              key={option.value}
              onClick={() => handleSelect(option.value)}
              aria-pressed={isSelected}
              className={`w-full flex items-center justify-between px-4 py-3 rounded-lg transition-colors touch-feedback ${
                isSelected
                  ? 'bg-primary/20 text-primary'
                  : 'text-text-primary hover:bg-surface-light active:bg-surface-light'
              }`}
            >
              <div>
                <span className="font-medium">{option.label}</span>{' '}
                <span className="ml-2 text-sm text-text-muted">{option.description}</span>
              </div>
              {isSelected && <Check className="w-5 h-5" />}
            </button>
          );
        })}
      </div>
    </BottomSheet>
  );
}
