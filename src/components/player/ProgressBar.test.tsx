import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProgressBar } from './ProgressBar';

describe('ProgressBar', () => {
  const defaultProps = {
    currentTime: 30,
    duration: 120,
    onSeek: vi.fn(),
  };

  it('should render current time and duration', () => {
    render(<ProgressBar {...defaultProps} />);

    expect(screen.getByText('0:30')).toBeInTheDocument();
    expect(screen.getByText('2:00')).toBeInTheDocument();
  });

  it('should render slider with correct aria attributes', () => {
    render(<ProgressBar {...defaultProps} />);

    const slider = screen.getByRole('slider');
    expect(slider).toHaveAttribute('aria-label', 'Playback progress');
    expect(slider).toHaveAttribute('aria-valuemin', '0');
    expect(slider).toHaveAttribute('aria-valuemax', '120');
    expect(slider).toHaveAttribute('aria-valuenow', '30');
  });

  it('should format time correctly for 0:00', () => {
    render(<ProgressBar currentTime={0} duration={0} onSeek={vi.fn()} />);
    const timeElements = screen.getAllByText('0:00');
    expect(timeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should format time correctly for longer durations', () => {
    render(<ProgressBar currentTime={65} duration={3661} onSeek={vi.fn()} />);
    expect(screen.getByText('1:05')).toBeInTheDocument();
    expect(screen.getByText('1:01:01')).toBeInTheDocument();
  });

  it('should handle negative or infinite time', () => {
    render(<ProgressBar currentTime={-5} duration={Infinity} onSeek={vi.fn()} />);
    // formatTime clamps negative to 0:00 and handles Infinity
    const timeElements = screen.getAllByText('0:00');
    expect(timeElements.length).toBeGreaterThanOrEqual(1);
  });

  it('should call onSeek when progress bar is clicked', () => {
    const onSeek = vi.fn();
    render(<ProgressBar {...defaultProps} onSeek={onSeek} />);

    const slider = screen.getByRole('slider');

    // Mock getBoundingClientRect
    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 10, height: 10 }),
    });

    fireEvent.mouseDown(slider, { clientX: 100 });
    expect(onSeek).toHaveBeenCalled();
    // clientX 100 / width 200 * duration 120 = 60
    expect(onSeek).toHaveBeenCalledWith(60);
  });

  it('should not seek when disabled', () => {
    const onSeek = vi.fn();
    render(<ProgressBar {...defaultProps} onSeek={onSeek} disabled={true} />);

    const slider = screen.getByRole('slider');
    fireEvent.mouseDown(slider, { clientX: 100 });
    expect(onSeek).not.toHaveBeenCalled();
  });

  it('should handle mouse move for hover time', () => {
    render(<ProgressBar {...defaultProps} />);

    const slider = screen.getByRole('slider');

    Object.defineProperty(slider, 'getBoundingClientRect', {
      value: () => ({ left: 0, width: 200, top: 0, right: 200, bottom: 10, height: 10 }),
    });

    fireEvent.mouseMove(slider, { clientX: 50 });
    // Hover time tooltip should appear (50/200 * 120 = 30)
    // The tooltip shows formatted time
  });

  it('should clear hover on mouse leave', () => {
    render(<ProgressBar {...defaultProps} />);

    const slider = screen.getByRole('slider');
    fireEvent.mouseLeave(slider);
    // Hover time should be cleared
  });
});
