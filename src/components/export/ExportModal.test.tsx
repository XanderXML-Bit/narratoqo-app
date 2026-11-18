import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ExportModal } from './ExportModal';

// Mock AudioExporter
vi.mock('@/services/audio/AudioExporter', () => ({
  getAudioExporter: vi.fn(() => ({
    exportFullAudio: vi.fn().mockResolvedValue({ blob: new Blob() }),
    downloadBlob: vi.fn(),
  })),
}));

const defaultProps = {
  isOpen: true,
  onClose: vi.fn(),
  projectId: 'p1',
  projectTitle: 'My Audiobook',
  segments: [
    { index: 0, text: 'Hello world', type: 'narrative' as const, speaker: '' },
    { index: 1, text: 'Second segment', type: 'narrative' as const, speaker: '' },
  ],
  segmentAudioStatus: { 0: true, 1: true } as Record<number, boolean>,
};

describe('ExportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should not render when closed', () => {
    const { container } = render(<ExportModal {...defaultProps} isOpen={false} />);
    expect(container.innerHTML).toBe('');
  });

  it('should render when open', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Export Audiobook')).toBeTruthy();
  });

  it('should show project title in description', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText(/My Audiobook/)).toBeTruthy();
  });

  it('should show segment count', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('2')).toBeTruthy();
  });

  it('should show WAV format info', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('WAV (high quality)')).toBeTruthy();
  });

  it('should have Export WAV button', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Export WAV')).toBeTruthy();
  });

  it('should have Cancel button', () => {
    render(<ExportModal {...defaultProps} />);
    expect(screen.getByText('Cancel')).toBeTruthy();
  });

  it('should have close button', () => {
    render(<ExportModal {...defaultProps} />);
    const closeButton = screen.getByLabelText('Close');
    expect(closeButton).toBeTruthy();

    fireEvent.click(closeButton);
    expect(defaultProps.onClose).toHaveBeenCalled();
  });

  it('should be a dialog with correct role', () => {
    render(<ExportModal {...defaultProps} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
  });

  it('should show missing audio warning when segments lack audio', () => {
    render(
      <ExportModal
        {...defaultProps}
        segmentAudioStatus={{ 0: true }}
      />
    );
    expect(screen.getByText(/hasn't been generated yet/)).toBeTruthy();
  });

  it('should disable export when segments are missing audio', () => {
    render(
      <ExportModal
        {...defaultProps}
        segmentAudioStatus={{}}
      />
    );
    const exportButton = screen.getByText('Export WAV').closest('button');
    expect(exportButton?.disabled).toBe(true);
  });
});
