import { useState } from 'react';
import { ArrowLeft, Menu } from 'lucide-react';
import { MobileMenu } from './MobileMenu';

interface MobileHeaderProps {
  title: string;
  subtitle?: string;
  onBack: () => void;
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

export function MobileHeader({
  title,
  subtitle,
  onBack,
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
}: MobileHeaderProps) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  return (
    <>
      <header
        className="fixed top-0 inset-x-0 z-40 flex items-center justify-between px-2 h-14 bg-surface border-b border-surface-light"
        style={{ paddingTop: 'var(--safe-area-top)' }}
      >
        {/* Back button */}
        <button
          onClick={onBack}
          className="touch-target text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Go back"
        >
          <ArrowLeft className="w-6 h-6" />
        </button>

        {/* Title */}
        <div className="flex-1 min-w-0 px-2 text-center">
          <h1 className="text-base font-semibold text-text-primary truncate">
            {title}
          </h1>
          {subtitle && (
            <p className="text-xs text-text-muted truncate">{subtitle}</p>
          )}
        </div>

        {/* Menu button */}
        <button
          onClick={() => setIsMenuOpen(true)}
          className="touch-target text-text-secondary hover:text-text-primary transition-colors"
          aria-label="Open menu"
        >
          <Menu className="w-6 h-6" />
        </button>
      </header>

      {/* Slide-out menu */}
      <MobileMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        providerName={providerName}
        voiceName={voiceName}
        isPaginated={isPaginated}
        onTogglePaginated={onTogglePaginated}
        viewMode={viewMode}
        onToggleViewMode={onToggleViewMode}
        autoRead={autoRead}
        onToggleAutoRead={onToggleAutoRead}
        onFullAudioMode={onFullAudioMode}
        onExport={onExport}
        onSettings={onSettings}
        isGenerating={isGenerating}
        hasSegments={hasSegments}
      />
    </>
  );
}
