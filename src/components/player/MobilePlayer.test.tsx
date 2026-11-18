import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MobilePlayer } from './MobilePlayer';

const props = {
  isPlaying: false,
  isLoading: false,
  currentTime: 0,
  duration: 10,
  speed: 1,
  volume: 1,
  isMuted: false,
  segmentTitle: 'Chapter One',
  segmentIndex: 0,
  totalSegments: 3,
  projectTitle: 'Sample',
  onPlayPause: vi.fn(),
  onSeek: vi.fn(),
  onSpeedChange: vi.fn(),
  onVolumeChange: vi.fn(),
  onMuteToggle: vi.fn(),
  onPrevSegment: vi.fn(),
  onNextSegment: vi.fn(),
  onSeekBackward: vi.fn(),
  onSeekForward: vi.fn(),
};

describe('MobilePlayer', () => {
  // WCAG 2.5.3 (axe label-content-name-mismatch): the accessible name of the
  // mini-player expand button must contain its visible text.
  it('names the expand button with its visible text plus the action', () => {
    render(<MobilePlayer {...props} />);
    const button = screen.getByRole('button', { name: /open the full player/i });
    expect(button).not.toHaveAttribute('aria-label');
    const name = button.textContent ?? '';
    expect(name).toContain('Chapter One');
    expect(name).toContain('Segment 1 of 3');
  });
});
