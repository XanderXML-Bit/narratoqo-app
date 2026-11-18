import { useSyncExternalStore } from 'react';

/**
 * Shared download state for on-device voice models (Kokoro, Piper).
 *
 * Providers report byte progress here so any part of the UI can show a
 * single, accurate progress indicator without owning the provider instance.
 */
export type LocalModelId = 'kokoro' | 'piper';

export interface ModelDownloadState {
  model: LocalModelId | null;
  status: 'idle' | 'downloading' | 'ready' | 'error';
  /** Bytes received so far across all files of the current download. */
  loaded: number;
  /** Expected total bytes (best estimate until every file reports its size). */
  total: number;
  error?: string;
}

/** Approximate one-time download sizes, stated to the user before any download. */
export const LOCAL_MODEL_SIZES_MB: Record<LocalModelId, number> = {
  // onnx/model_quantized.onnx is 92.4 MB; the default voice file adds 0.5 MB.
  kokoro: 93,
  // en_US-hfc_female-medium.onnx is 63 MB; other voices range from 20 to 115 MB.
  piper: 63,
};

const IDLE: ModelDownloadState = { model: null, status: 'idle', loaded: 0, total: 0 };

let state: ModelDownloadState = IDLE;
const listeners = new Set<() => void>();

function emit(next: ModelDownloadState): void {
  state = next;
  listeners.forEach((l) => l());
}

export function getModelDownloadState(): ModelDownloadState {
  return state;
}

export function subscribeModelDownload(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function reportModelProgress(model: LocalModelId, loaded: number, total: number): void {
  // Within one download the counts only grow, so the banner never steps backwards.
  const same = state.model === model && state.status === 'downloading';
  const nextLoaded = same ? Math.max(loaded, state.loaded) : loaded;
  const nextTotal = Math.max(total, nextLoaded, same ? state.total : 0);
  emit({ model, status: 'downloading', loaded: nextLoaded, total: nextTotal });
}

export function reportModelReady(model: LocalModelId): void {
  emit({ model, status: 'ready', loaded: state.total, total: state.total });
}

export function reportModelError(model: LocalModelId, error: string): void {
  emit({ ...state, model, status: 'error', error });
}

/** Test helper. */
export function resetModelDownloadState(): void {
  emit(IDLE);
}

/** React hook for the shared model download state. */
export function useModelDownload(): ModelDownloadState {
  return useSyncExternalStore(subscribeModelDownload, getModelDownloadState, getModelDownloadState);
}

/**
 * Tracks byte progress across several files (transformers.js reports
 * progress per file) and reduces it to a single loaded/total pair.
 */
export class MultiFileProgress {
  private files = new Map<string, { loaded: number; total: number }>();

  update(file: string, loaded: number, total: number): { loaded: number; total: number } {
    this.files.set(file, { loaded, total });
    let l = 0;
    let t = 0;
    for (const f of this.files.values()) {
      l += f.loaded;
      t += f.total;
    }
    return { loaded: l, total: t };
  }
}

/** Whether a URL is already present in a named Cache Storage bucket. */
export async function isUrlCached(cacheName: string, url: string): Promise<boolean> {
  try {
    if (typeof caches === 'undefined') return false;
    const cache = await caches.open(cacheName);
    return (await cache.match(url)) !== undefined;
  } catch {
    return false;
  }
}
