import { useEffect, useCallback, useState, memo } from 'react';
import {
  X,
  Mic,
  Layers,
  ScrollText,
  BookOpen,
  List,
  RefreshCw,
  Headphones,
  Download,
  Settings,
  ChevronRight,
} from 'lucide-react';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  // Provider/voice info
  providerName: string;
  voiceName: string;
  // Toggle states and handlers
  isPaginated: boolean;
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

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  isActive?: boolean;
  disabled?: boolean;
  subtitle?: string;
  showChevron?: boolean;
}

const MenuItem = memo(function MenuItem({
  icon,
  label,
  onClick,
  isActive = false,
  disabled = false,
  subtitle,
  showChevron = false,
}: MenuItemProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`w-full flex items-center gap-4 px-4 py-3 text-left transition-colors touch-feedback ${
        isActive
          ? 'bg-primary/20 text-primary'
          : disabled
            ? 'text-text-muted cursor-not-allowed'
            : 'text-text-primary hover:bg-surface-light active:bg-surface-light'
      }`}
    >
      <span className="flex-shrink-0 w-6 h-6">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-medium">{label}</div>
        {subtitle && (
          <div className="text-sm text-text-muted truncate">{subtitle}</div>
        )}
      </div>
      {showChevron && (
        <ChevronRight className="w-5 h-5 text-text-muted flex-shrink-0" />
      )}
    </button>
  );
});

export function MobileMenu({
  isOpen,
  onClose,
  providerName,
  voiceName,
  isPaginated,
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
}: MobileMenuProps) {
  const [isClosing, setIsClosing] = useState(false);

  const handleClose = useCallback(() => {
    setIsClosing(true);
    setTimeout(() => {
      setIsClosing(false);
      onClose();
    }, 250);
  }, [onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, handleClose]);

  // Wrap action to close menu after
  const handleAction = (action: () => void) => {
    handleClose();
    // Small delay to let animation start
    setTimeout(action, 100);
  };

  if (!isOpen && !isClosing) return null;

  return (
    <div className="fixed inset-0 z-50">
      {/* Backdrop */}
      <div
        className={`absolute inset-0 bg-black/60 ${isClosing ? 'animate-fade-out' : 'animate-fade-in'}`}
        onClick={handleClose}
      />

      {/* Menu panel */}
      <div
        className={`absolute top-0 right-0 bottom-0 w-80 max-w-[85vw] bg-surface shadow-xl ${
          isClosing ? 'animate-slide-out-right' : 'animate-slide-in-right'
        }`}
        style={{ paddingTop: 'var(--safe-area-top)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-surface-light">
          <h2 className="text-lg font-semibold text-text-primary">Menu</h2>
          <button
            onClick={handleClose}
            className="touch-target text-text-secondary hover:text-text-primary"
            aria-label="Close menu"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Menu items */}
        <div className="py-2">
          {/* Provider/Voice info */}
          <MenuItem
            icon={<Mic className="w-6 h-6" />}
            label="Voice"
            subtitle={`${providerName} - ${voiceName}`}
            onClick={() => handleAction(onSettings)}
            showChevron
          />

          <div className="h-px bg-surface-light my-2" />

          {/* Layout toggle */}
          <MenuItem
            icon={isPaginated ? <Layers className="w-6 h-6" /> : <ScrollText className="w-6 h-6" />}
            label={isPaginated ? 'Paginated View' : 'Scroll View'}
            subtitle={isPaginated ? 'Tap to switch to scroll' : 'Tap to switch to pages'}
            onClick={() => {
              onTogglePaginated();
              handleClose();
            }}
            isActive={isPaginated}
          />

          {/* View mode toggle */}
          <MenuItem
            icon={viewMode === 'continuous' ? <BookOpen className="w-6 h-6" /> : <List className="w-6 h-6" />}
            label={viewMode === 'continuous' ? 'Continuous Reading' : 'Segmented View'}
            subtitle={viewMode === 'continuous' ? 'Flowing text' : 'Individual segments'}
            onClick={() => {
              onToggleViewMode();
              handleClose();
            }}
            isActive={viewMode === 'continuous'}
          />

          {/* Auto-read toggle */}
          <MenuItem
            icon={<RefreshCw className="w-6 h-6" aria-hidden="true" />}
            label="Auto-Read"
            subtitle={autoRead ? 'On: plays every segment in order' : 'Off: stops after each segment'}
            onClick={() => {
              onToggleAutoRead();
              handleClose();
            }}
            isActive={autoRead}
            disabled={isGenerating}
          />

          <div className="h-px bg-surface-light my-2" />

          {/* Full Audio Mode */}
          <MenuItem
            icon={<Headphones className="w-6 h-6" />}
            label="Full Audio Mode"
            subtitle="Play entire audiobook"
            onClick={() => handleAction(onFullAudioMode)}
            disabled={isGenerating || !hasSegments}
          />

          {/* Export */}
          <MenuItem
            icon={<Download className="w-6 h-6" />}
            label="Export"
            subtitle="Download audiobook"
            onClick={() => handleAction(onExport)}
            disabled={isGenerating || !hasSegments}
          />

          <div className="h-px bg-surface-light my-2" />

          {/* Settings */}
          <MenuItem
            icon={<Settings className="w-6 h-6" />}
            label="Settings"
            subtitle="API keys, voices, preferences"
            onClick={() => handleAction(onSettings)}
            showChevron
          />
        </div>
      </div>
    </div>
  );
}
