import {
  ArrowLeft,
  Settings,
  Mic,
  Layers,
  ScrollText,
  BookOpen,
  List,
  RefreshCw,
  Headphones,
  Download,
} from 'lucide-react';

interface DesktopProjectHeaderProps {
  title: string;
  segmentCount: number;
  currentSegmentIndex: number;
  currentPage?: number;
  pageCount?: number;
  isPaginated: boolean;
  onBack: () => void;
  // Provider/voice info
  providerName: string;
  voiceName: string;
  // Toggle states and handlers
  onTogglePaginated: () => void;
  viewMode: 'segmented' | 'continuous';
  onToggleViewMode: () => void;
  autoRead: boolean;
  onToggleAutoRead: () => void;
  // Actions
  onFullAudioMode: () => void;
  onExport: () => void;
  onSettings: () => void;
  // Disabled states
  isGenerating: boolean;
  hasSegments: boolean;
}

export function DesktopProjectHeader({
  title,
  segmentCount,
  currentSegmentIndex,
  currentPage,
  pageCount,
  isPaginated,
  onBack,
  providerName,
  voiceName,
  onTogglePaginated,
  viewMode,
  onToggleViewMode,
  autoRead,
  onToggleAutoRead,
  onFullAudioMode,
  onExport,
  onSettings,
  isGenerating,
  hasSegments,
}: DesktopProjectHeaderProps) {
  return (
    <header className="flex items-center gap-4 px-6 py-4 border-b border-surface-light">
      <button
        onClick={onBack}
        className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
        aria-label="Back to projects"
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <div className="flex-1 min-w-0">
        <h1 className="text-lg font-semibold text-text-primary truncate">
          {title}
        </h1>
        <p className="text-sm text-text-muted">
          {segmentCount} {segmentCount === 1 ? 'segment' : 'segments'} | Segment {currentSegmentIndex + 1}
          {isPaginated && currentPage !== undefined && pageCount !== undefined && ` | Page ${currentPage + 1} of ${pageCount}`}
        </p>
      </div>

      {/* Provider/Voice indicator */}
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary text-sm">
        <Mic className="w-4 h-4" />
        <span>{providerName} - {voiceName}</span>
      </div>

      {/* Layout Toggle */}
      <button
        onClick={onTogglePaginated}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
          isPaginated
            ? 'bg-primary text-on-primary'
            : 'bg-surface-light text-text-secondary hover:bg-surface-dark'
        }`}
        title={isPaginated ? 'Switch to scroll view' : 'Switch to paginated view'}
        aria-label="Paginated view"
        aria-pressed={isPaginated}
      >
        {isPaginated ? (
          <Layers className="w-4 h-4" />
        ) : (
          <ScrollText className="w-4 h-4" />
        )}
      </button>

      {/* View Mode Toggle */}
      <button
        onClick={onToggleViewMode}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
          viewMode === 'continuous'
            ? 'bg-primary text-on-primary'
            : 'bg-surface-light text-text-secondary hover:bg-surface-dark'
        }`}
        title={viewMode === 'continuous' ? 'Switch to segmented view' : 'Switch to continuous reading view'}
        aria-label="Continuous reading view"
        aria-pressed={viewMode === 'continuous'}
      >
        {viewMode === 'continuous' ? (
          <BookOpen className="w-4 h-4" />
        ) : (
          <List className="w-4 h-4" />
        )}
      </button>

      {/* Auto-read toggle */}
      <button
        onClick={onToggleAutoRead}
        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg transition-colors ${
          autoRead
            ? 'bg-primary text-on-primary'
            : 'bg-surface-light text-text-secondary hover:bg-surface-dark'
        }`}
        title={autoRead ? 'Auto: on. Plays every segment in order. Turn off to stop after each segment.' : 'Auto: off. Stops after each segment. Turn on to play every segment in order.'}
        aria-pressed={autoRead}
      >
        <RefreshCw className="w-4 h-4" aria-hidden="true" />
        <span className="text-sm">Auto</span>
      </button>

      {/* Full Audio Mode button */}
      <button
        onClick={onFullAudioMode}
        disabled={isGenerating || !hasSegments}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary hover:bg-primary hover:text-on-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Enter Full Audio Mode - play entire audiobook with word highlighting"
      >
        <Headphones className="w-4 h-4" />
        <span className="text-sm">Full Audio</span>
      </button>

      {/* Export button */}
      <button
        onClick={onExport}
        disabled={isGenerating || !hasSegments}
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-surface-light text-text-secondary hover:bg-surface-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        title="Export full audiobook as single file"
      >
        <Download className="w-4 h-4" />
        <span className="text-sm">Export</span>
      </button>

      <button
        onClick={onSettings}
        className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
        title="Settings"
        aria-label="Settings"
      >
        <Settings className="w-5 h-5" />
      </button>
    </header>
  );
}
