import { useEffect } from 'react';

export const APP_TITLE = 'Narratoqo: free audiobook narration in your browser';

/** Sets document.title while the calling page is mounted. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    document.title = title;
  }, [title]);
}
