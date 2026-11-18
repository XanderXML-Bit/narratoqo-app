import { useMediaQuery } from './useMediaQuery';

export type DeviceType = 'mobile' | 'tablet' | 'desktop';

export interface DeviceInfo {
  /** Screen width < 640px */
  isMobile: boolean;
  /** Screen width >= 640px and < 1024px */
  isTablet: boolean;
  /** Screen width >= 1024px */
  isDesktop: boolean;
  /** Device has coarse pointer (touch) */
  isTouchDevice: boolean;
  /** Device has fine pointer (mouse) */
  hasMousePointer: boolean;
  /** Orientation is portrait */
  isPortrait: boolean;
  /** Orientation is landscape */
  isLandscape: boolean;
  /** User prefers reduced motion */
  prefersReducedMotion: boolean;
  /** Computed device type */
  deviceType: DeviceType;
}

/**
 * React hook for comprehensive device detection.
 * Uses CSS media queries for accurate, real-time device info.
 *
 * Breakpoints aligned with Tailwind CSS defaults:
 * - mobile: < 640px (sm breakpoint)
 * - tablet: >= 640px and < 1024px
 * - desktop: >= 1024px (lg breakpoint)
 */
export function useDeviceDetection(): DeviceInfo {
  const isMobile = useMediaQuery('(max-width: 639px)');
  const isTablet = useMediaQuery('(min-width: 640px) and (max-width: 1023px)');
  const isDesktop = useMediaQuery('(min-width: 1024px)');
  const isTouchDevice = useMediaQuery('(pointer: coarse)');
  const hasMousePointer = useMediaQuery('(pointer: fine)');
  const isPortrait = useMediaQuery('(orientation: portrait)');
  const isLandscape = useMediaQuery('(orientation: landscape)');
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');

  const deviceType: DeviceType = isMobile ? 'mobile' : isTablet ? 'tablet' : 'desktop';

  return {
    isMobile,
    isTablet,
    isDesktop,
    isTouchDevice,
    hasMousePointer,
    isPortrait,
    isLandscape,
    prefersReducedMotion,
    deviceType,
  };
}
