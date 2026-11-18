import { useState, useCallback, useEffect } from 'react';
import { X, Download, Loader2, CheckCircle, AlertCircle } from 'lucide-react';
import { getAudioExporter } from '@/services/audio/AudioExporter';
import type { ExportProgress } from '@/services/audio/AudioExporter';
import type { TextSegment } from '@/services/segmentation';

interface ExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  projectId: string;
  projectTitle: string;
  segments: TextSegment[];
  /** Record of segment index to audio status (true = ready, false/undefined = not ready) */
  segmentAudioStatus: Record<number, boolean>;
}

export function ExportModal({
  isOpen,
  onClose,
  projectId,
  projectTitle,
  segments,
  segmentAudioStatus,
}: ExportModalProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState<ExportProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleClose = useCallback(() => {
    if (isExporting) return;
    setError(null);
    setSuccess(false);
    setProgress(null);
    onClose();
  }, [isExporting, onClose]);

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  const handleExport = useCallback(async () => {
    setIsExporting(true);
    setError(null);
    setSuccess(false);

    try {
      const exporter = getAudioExporter();
      const result = await exporter.exportFullAudio(projectId, segments, {
        format: 'wav',
        onProgress: setProgress,
      });

      // Sanitize filename
      const safeTitle = projectTitle.replace(/[^a-z0-9]/gi, '_').substring(0, 50) || 'audiobook';
      exporter.downloadBlob(result.blob, `${safeTitle}.wav`);
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIsExporting(false);
    }
  }, [projectId, projectTitle, segments]);

  if (!isOpen) return null;

  // Filter to readable segments only
  const readableSegments = segments.filter(s => /\p{L}/u.test(s.text));

  // Count segments missing audio (Record lookup is O(1))
  const missingAudio = readableSegments.filter(
    seg => !segmentAudioStatus[seg.index]
  ).length;

  const progressPercent = progress ? Math.round((progress.current / progress.total) * 100) : 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
    >
      <div className="bg-surface rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-surface-light">
          <h2 id="export-modal-title" className="text-lg font-semibold text-text-primary">Export Audiobook</h2>
          <button
            onClick={handleClose}
            disabled={isExporting}
            className="p-1 text-text-muted hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-4 space-y-4">
          {/* Initial state - show info */}
          {!isExporting && !success && !error && (
            <>
              <p className="text-text-secondary">
                Export "{projectTitle}" as a single audio file.
              </p>

              <div className="bg-surface-light rounded-lg p-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Segments</span>
                  <span className="text-text-primary">{readableSegments.length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-text-muted">Format</span>
                  <span className="text-text-primary">WAV (high quality)</span>
                </div>
                {missingAudio > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-text-muted">Missing audio</span>
                    <span className="text-warning">{missingAudio} segments</span>
                  </div>
                )}
              </div>

              {missingAudio > 0 && (
                <div className="flex items-start gap-2 p-3 bg-warning/10 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-warning">
                    {missingAudio} segment{missingAudio > 1 ? 's haven\'t' : ' hasn\'t'} been generated yet.
                    Generate all segments before exporting.
                  </p>
                </div>
              )}
            </>
          )}

          {/* Exporting state - show progress */}
          {isExporting && progress && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 text-primary animate-spin" />
                <span className="text-text-primary">{progress.message}</span>
              </div>

              <div className="w-full bg-surface-light rounded-full h-2 overflow-hidden">
                <div
                  className="bg-primary h-2 rounded-full transition-all duration-300"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>

              <p className="text-sm text-text-muted text-center">
                {progress.current} / {progress.total} ({progressPercent}%)
              </p>
            </div>
          )}

          {/* Success state */}
          {success && (
            <div className="flex flex-col items-center gap-3 py-4">
              <CheckCircle className="w-12 h-12 text-success" />
              <p className="text-text-primary font-medium">Export Complete!</p>
              <p className="text-sm text-text-muted">Your audiobook has been downloaded.</p>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-start gap-2 p-3 bg-error/10 rounded-lg">
              <AlertCircle className="w-5 h-5 text-error flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-error">Export Failed</p>
                <p className="text-sm text-error/80 mt-1">{error}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-surface-light">
          <button
            onClick={handleClose}
            disabled={isExporting}
            className="px-4 py-2 text-text-secondary hover:text-text-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {success ? 'Close' : 'Cancel'}
          </button>

          {!success && (
            <button
              onClick={handleExport}
              disabled={isExporting || missingAudio > 0}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
            >
              {isExporting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Export WAV
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
