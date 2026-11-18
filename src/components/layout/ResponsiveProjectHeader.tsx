import { useDeviceDetection } from '@/hooks';
import { MobileHeader } from './MobileHeader';
import { DesktopProjectHeader } from './DesktopProjectHeader';

interface ResponsiveProjectHeaderProps {
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

/**
 * Responsive header that switches between mobile and desktop layouts.
 * Uses CSS-based device detection for accurate breakpoint handling.
 */
export function ResponsiveProjectHeader(props: ResponsiveProjectHeaderProps) {
  const { isMobile } = useDeviceDetection();

  if (isMobile) {
    return (
      <MobileHeader
        title={props.title}
        subtitle={`Segment ${props.currentSegmentIndex + 1} of ${props.segmentCount}`}
        onBack={props.onBack}
        providerName={props.providerName}
        voiceName={props.voiceName}
        isPaginated={props.isPaginated}
        onTogglePaginated={props.onTogglePaginated}
        viewMode={props.viewMode}
        onToggleViewMode={props.onToggleViewMode}
        autoRead={props.autoRead}
        onToggleAutoRead={props.onToggleAutoRead}
        onFullAudioMode={props.onFullAudioMode}
        onExport={props.onExport}
        onSettings={props.onSettings}
        isGenerating={props.isGenerating}
        hasSegments={props.hasSegments}
      />
    );
  }

  return <DesktopProjectHeader {...props} />;
}
