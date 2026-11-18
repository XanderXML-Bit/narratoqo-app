import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlaybackControls } from './PlaybackControls';

describe('PlaybackControls', () => {
  const defaultProps = {
    isPlaying: false,
    volume: 1,
    onPlayPause: vi.fn(),
    onSkipBack: vi.fn(),
    onSkipForward: vi.fn(),
    onVolumeChange: vi.fn(),
  };

  it('should render all controls', () => {
    render(<PlaybackControls {...defaultProps} />);

    expect(screen.getByLabelText('Play')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip back 10 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Skip forward 30 seconds')).toBeInTheDocument();
    expect(screen.getByLabelText('Mute')).toBeInTheDocument();
    expect(screen.getByLabelText('Volume')).toBeInTheDocument();
  });

  it('should show Pause button when playing', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={true} />);
    expect(screen.getByLabelText('Pause')).toBeInTheDocument();
  });

  it('should show Play button when paused', () => {
    render(<PlaybackControls {...defaultProps} isPlaying={false} />);
    expect(screen.getByLabelText('Play')).toBeInTheDocument();
  });

  it('should call onPlayPause when play/pause button is clicked', () => {
    render(<PlaybackControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Play'));
    expect(defaultProps.onPlayPause).toHaveBeenCalledTimes(1);
  });

  it('should call onSkipBack when skip back button is clicked', () => {
    render(<PlaybackControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Skip back 10 seconds'));
    expect(defaultProps.onSkipBack).toHaveBeenCalledTimes(1);
  });

  it('should call onSkipForward when skip forward button is clicked', () => {
    render(<PlaybackControls {...defaultProps} />);
    fireEvent.click(screen.getByLabelText('Skip forward 30 seconds'));
    expect(defaultProps.onSkipForward).toHaveBeenCalledTimes(1);
  });

  it('should show Unmute label when volume is 0', () => {
    render(<PlaybackControls {...defaultProps} volume={0} />);
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument();
  });

  it('should toggle mute when volume button is clicked', () => {
    const onVolumeChange = vi.fn();
    const { rerender } = render(
      <PlaybackControls {...defaultProps} volume={1} onVolumeChange={onVolumeChange} />
    );

    // Click mute (volume > 0, should set to 0)
    fireEvent.click(screen.getByLabelText('Mute'));
    expect(onVolumeChange).toHaveBeenCalledWith(0);

    // Rerender with muted state
    rerender(
      <PlaybackControls {...defaultProps} volume={0} onVolumeChange={onVolumeChange} />
    );

    // Click unmute (volume === 0, should set to 1)
    fireEvent.click(screen.getByLabelText('Unmute'));
    expect(onVolumeChange).toHaveBeenCalledWith(1);
  });

  it('should call onVolumeChange when volume slider changes', () => {
    const onVolumeChange = vi.fn();
    render(<PlaybackControls {...defaultProps} onVolumeChange={onVolumeChange} />);

    const slider = screen.getByLabelText('Volume');
    fireEvent.change(slider, { target: { value: '0.5' } });
    expect(onVolumeChange).toHaveBeenCalledWith(0.5);
  });

  it('should disable buttons when disabled prop is true', () => {
    render(<PlaybackControls {...defaultProps} disabled={true} />);

    expect(screen.getByLabelText('Play')).toBeDisabled();
    expect(screen.getByLabelText('Skip back 10 seconds')).toBeDisabled();
    expect(screen.getByLabelText('Skip forward 30 seconds')).toBeDisabled();
  });

  it('should not disable buttons by default', () => {
    render(<PlaybackControls {...defaultProps} />);

    expect(screen.getByLabelText('Play')).not.toBeDisabled();
    expect(screen.getByLabelText('Skip back 10 seconds')).not.toBeDisabled();
    expect(screen.getByLabelText('Skip forward 30 seconds')).not.toBeDisabled();
  });
});
