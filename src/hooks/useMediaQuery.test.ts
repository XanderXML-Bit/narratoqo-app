import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMediaQuery } from './useMediaQuery';

describe('useMediaQuery', () => {
  let listeners: Map<string, Set<() => void>>;
  let matchStates: Map<string, boolean>;

  beforeEach(() => {
    listeners = new Map();
    matchStates = new Map();

    // Mock window.matchMedia
    Object.defineProperty(window, 'matchMedia', {
      value: vi.fn((query: string) => {
        if (!listeners.has(query)) {
          listeners.set(query, new Set());
        }

        return {
          matches: matchStates.get(query) ?? false,
          media: query,
          addEventListener: (_event: string, callback: () => void) => {
            listeners.get(query)!.add(callback);
          },
          removeEventListener: (_event: string, callback: () => void) => {
            listeners.get(query)!.delete(callback);
          },
        };
      }),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function setMediaMatch(query: string, matches: boolean) {
    matchStates.set(query, matches);
    // Notify listeners
    const queryListeners = listeners.get(query);
    if (queryListeners) {
      queryListeners.forEach((cb) => cb());
    }
  }

  it('should return false by default when query does not match', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);
  });

  it('should return true when query matches', () => {
    matchStates.set('(max-width: 639px)', true);
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(true);
  });

  it('should update when media query changes', () => {
    const { result } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    expect(result.current).toBe(false);

    act(() => {
      setMediaMatch('(max-width: 639px)', true);
    });

    expect(result.current).toBe(true);
  });

  it('should clean up event listener on unmount', () => {
    const { unmount } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    const queryListeners = listeners.get('(max-width: 639px)');
    expect(queryListeners?.size).toBe(1);

    unmount();
    expect(queryListeners?.size).toBe(0);
  });

  it('should handle different query strings independently', () => {
    matchStates.set('(max-width: 639px)', true);
    matchStates.set('(min-width: 1024px)', false);

    const { result: mobileResult } = renderHook(() => useMediaQuery('(max-width: 639px)'));
    const { result: desktopResult } = renderHook(() => useMediaQuery('(min-width: 1024px)'));

    expect(mobileResult.current).toBe(true);
    expect(desktopResult.current).toBe(false);
  });
});
