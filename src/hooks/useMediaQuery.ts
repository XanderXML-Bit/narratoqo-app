import { useSyncExternalStore } from 'react';

/**
 * React hook for responsive media queries using useSyncExternalStore.
 * This is the recommended approach for subscribing to browser APIs in React 18+.
 *
 * @param query - CSS media query string (e.g., '(max-width: 639px)')
 * @returns boolean indicating if the query matches
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (callback: () => void) => {
    const mql = window.matchMedia(query);
    mql.addEventListener('change', callback);
    return () => mql.removeEventListener('change', callback);
  };

  const getSnapshot = () => window.matchMedia(query).matches;

  // SSR fallback - return false on server
  const getServerSnapshot = () => false;

  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
