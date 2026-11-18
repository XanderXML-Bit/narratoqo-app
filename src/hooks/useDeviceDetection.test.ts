import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useDeviceDetection } from './useDeviceDetection';

describe('useDeviceDetection', () => {
  let matchStates: Map<string, boolean>;

  beforeEach(() => {
    matchStates = new Map();

    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn((query: string) => ({
        matches: matchStates.get(query) ?? false,
        media: query,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      })),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should detect mobile device', () => {
    matchStates.set('(max-width: 639px)', true);
    matchStates.set('(pointer: coarse)', true);
    matchStates.set('(orientation: portrait)', true);

    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.isMobile).toBe(true);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTouchDevice).toBe(true);
    expect(result.current.deviceType).toBe('mobile');
  });

  it('should detect tablet device', () => {
    matchStates.set('(min-width: 640px) and (max-width: 1023px)', true);
    matchStates.set('(pointer: coarse)', true);
    matchStates.set('(orientation: landscape)', true);

    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(true);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.deviceType).toBe('tablet');
  });

  it('should detect desktop device', () => {
    matchStates.set('(min-width: 1024px)', true);
    matchStates.set('(pointer: fine)', true);
    matchStates.set('(orientation: landscape)', true);

    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(true);
    expect(result.current.hasMousePointer).toBe(true);
    expect(result.current.deviceType).toBe('desktop');
  });

  it('should detect orientation', () => {
    matchStates.set('(min-width: 1024px)', true);
    matchStates.set('(orientation: portrait)', true);

    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.isPortrait).toBe(true);
    expect(result.current.isLandscape).toBe(false);
  });

  it('should detect reduced motion preference', () => {
    matchStates.set('(min-width: 1024px)', true);
    matchStates.set('(prefers-reduced-motion: reduce)', true);

    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.prefersReducedMotion).toBe(true);
  });

  it('should default all to false/desktop when no queries match', () => {
    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current.isMobile).toBe(false);
    expect(result.current.isTablet).toBe(false);
    expect(result.current.isDesktop).toBe(false);
    expect(result.current.isTouchDevice).toBe(false);
    expect(result.current.hasMousePointer).toBe(false);
    // When none match, deviceType falls through to 'desktop'
    expect(result.current.deviceType).toBe('desktop');
  });

  it('should return all expected properties', () => {
    const { result } = renderHook(() => useDeviceDetection());

    expect(result.current).toHaveProperty('isMobile');
    expect(result.current).toHaveProperty('isTablet');
    expect(result.current).toHaveProperty('isDesktop');
    expect(result.current).toHaveProperty('isTouchDevice');
    expect(result.current).toHaveProperty('hasMousePointer');
    expect(result.current).toHaveProperty('isPortrait');
    expect(result.current).toHaveProperty('isLandscape');
    expect(result.current).toHaveProperty('prefersReducedMotion');
    expect(result.current).toHaveProperty('deviceType');
  });
});
