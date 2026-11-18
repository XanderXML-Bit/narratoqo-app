/**
 * Narratoqo AppBridge — Singleton programmatic interface for AI agents.
 *
 * Exposes all user-facing actions: project CRUD, import, playback control,
 * voice assignment, character management, settings.
 *
 * Accesses the Zustand store directly when available, falls back to
 * localStorage for headless/test scenarios.
 */

import type {
  Project,
  TextChunk,
  TTSProviderType,
  Settings,
} from '@/types';
import { StateInspector } from './StateInspector';
import { ActionRecorder } from './ActionRecorder';

interface BridgeResult<T = void> {
  ok: boolean;
  data?: T;
  error?: string;
}

function ok<T>(data: T): BridgeResult<T> { return { ok: true, data }; }
function fail(error: string): BridgeResult<never> { return { ok: false, error }; }

/** Shape of the Zustand store methods we use */
interface NarratoqoStore {
  getState: () => {
    projects: Project[];
    setCurrentProject: (project: Project) => void;
    addProject: (project: Project) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    removeProject: (id: string) => void;
    updateChunks: (projectId: string, chunks: TextChunk[]) => void;
    play: () => void;
    pause: () => void;
    togglePlay: () => void;
    seek: (time: number) => void;
    seekToChunk: (index: number) => void;
    setSpeed: (speed: number) => void;
    setVolume: (volume: number) => void;
    setHighlightMode: (mode: 'word' | 'sentence' | 'none') => void;
    setDefaultProvider?: (provider: TTSProviderType) => void;
    setDefaultVoiceId?: (voiceId: string) => void;
    setTheme?: (theme: 'light' | 'dark') => void;
    setMaxCacheSize?: (size: number) => void;
  };
}

/** Try to get the live Zustand store (only works when React app is mounted). */
function getStore(): NarratoqoStore | undefined {
  return (globalThis as Record<string, unknown>).__NARRATOQO_STORE as NarratoqoStore | undefined;
}

export class AppBridge {
  private static instance: AppBridge;
  readonly inspector: StateInspector;
  readonly recorder: ActionRecorder;

  // Simulated navigation state
  private _currentPage: 'home' | 'project' | 'settings' = 'home';
  private _currentProjectId: string | null = null;

  private constructor() {
    this.inspector = new StateInspector();
    this.recorder = new ActionRecorder();
  }

  static getInstance(): AppBridge {
    if (!AppBridge.instance) {
      AppBridge.instance = new AppBridge();
    }
    return AppBridge.instance;
  }

  // =========================================================================
  // Navigation
  // =========================================================================

  get currentPage() { return this._currentPage; }
  get currentProjectId() { return this._currentProjectId; }

  navigateHome(): BridgeResult<void> {
    this._currentPage = 'home';
    this._currentProjectId = null;
    this.recorder.record('navigateHome', {}, { ok: true });
    return ok(undefined);
  }

  navigateToProject(projectId: string): BridgeResult<void> {
    this._currentPage = 'project';
    this._currentProjectId = projectId;
    const store = getStore();
    if (store) {
      const project = store.getState().projects.find((p: Project) => p.id === projectId);
      if (project) store.getState().setCurrentProject(project);
    }
    this.recorder.record('navigateToProject', { projectId }, { ok: true });
    return ok(undefined);
  }

  navigateToSettings(): BridgeResult<void> {
    this._currentPage = 'settings';
    this.recorder.record('navigateToSettings', {}, { ok: true });
    return ok(undefined);
  }

  // =========================================================================
  // Project CRUD
  // =========================================================================

  createProject(input: {
    title: string;
    sourceType: 'text' | 'epub' | 'pdf' | 'url';
    content: string;
    defaultProvider?: TTSProviderType;
    defaultVoiceId?: string;
  }): BridgeResult<Project> {
    try {
      const project: Project = {
        id: crypto.randomUUID(),
        title: input.title,
        sourceType: input.sourceType,
        originalContent: input.content,
        chunks: [],
        defaultVoiceId: input.defaultVoiceId ?? '',
        defaultProvider: input.defaultProvider ?? 'webspeech',
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const store = getStore();
      if (store) {
        store.getState().addProject(project);
      }

      this.recorder.record('createProject', { title: input.title }, { ok: true });
      return ok(project);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  updateProject(id: string, updates: Partial<Project>): BridgeResult<void> {
    try {
      const store = getStore();
      if (store) {
        store.getState().updateProject(id, updates);
      }
      this.recorder.record('updateProject', { id, keys: Object.keys(updates) }, { ok: true });
      return ok(undefined);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  deleteProject(id: string): BridgeResult<void> {
    try {
      const store = getStore();
      if (store) {
        store.getState().removeProject(id);
      }
      if (this._currentProjectId === id) {
        this._currentProjectId = null;
        this._currentPage = 'home';
      }
      this.recorder.record('deleteProject', { id }, { ok: true });
      return ok(undefined);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  // =========================================================================
  // Chunks
  // =========================================================================

  updateChunks(projectId: string, chunks: TextChunk[]): BridgeResult<void> {
    try {
      const store = getStore();
      if (store) {
        store.getState().updateChunks(projectId, chunks);
      }
      this.recorder.record('updateChunks', { projectId, count: chunks.length }, { ok: true });
      return ok(undefined);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  // =========================================================================
  // Playback control
  // =========================================================================

  play(): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().play();
    this.recorder.record('play', {}, { ok: true });
    return ok(undefined);
  }

  pause(): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().pause();
    this.recorder.record('pause', {}, { ok: true });
    return ok(undefined);
  }

  togglePlay(): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().togglePlay();
    this.recorder.record('togglePlay', {}, { ok: true });
    return ok(undefined);
  }

  seek(time: number): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().seek(time);
    this.recorder.record('seek', { time }, { ok: true });
    return ok(undefined);
  }

  seekToChunk(index: number): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().seekToChunk(index);
    this.recorder.record('seekToChunk', { index }, { ok: true });
    return ok(undefined);
  }

  setSpeed(speed: number): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().setSpeed(speed);
    this.recorder.record('setSpeed', { speed }, { ok: true });
    return ok(undefined);
  }

  setVolume(volume: number): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().setVolume(volume);
    this.recorder.record('setVolume', { volume }, { ok: true });
    return ok(undefined);
  }

  setHighlightMode(mode: 'word' | 'sentence' | 'none'): BridgeResult<void> {
    const store = getStore();
    if (store) store.getState().setHighlightMode(mode);
    this.recorder.record('setHighlightMode', { mode }, { ok: true });
    return ok(undefined);
  }

  // =========================================================================
  // Settings
  // =========================================================================

  updateSettings(updates: Partial<Settings>): BridgeResult<void> {
    try {
      const store = getStore();
      if (store) {
        const state = store.getState();
        // Settings are individual setters in the store
        if (updates.defaultProvider !== undefined) state.setDefaultProvider?.(updates.defaultProvider);
        if (updates.defaultVoiceId !== undefined) state.setDefaultVoiceId?.(updates.defaultVoiceId);
        if (updates.theme !== undefined) state.setTheme?.(updates.theme);
        if (updates.maxCacheSizeMB !== undefined) state.setMaxCacheSize?.(updates.maxCacheSizeMB);
      }
      this.recorder.record('updateSettings', { keys: Object.keys(updates) }, { ok: true });
      return ok(undefined);
    } catch (e) {
      return fail(e instanceof Error ? e.message : String(e));
    }
  }

  // =========================================================================
  // State access
  // =========================================================================

  getState() {
    return {
      ...this.inspector.getFullState(),
      currentPage: this._currentPage,
      currentProjectId: this._currentProjectId,
    };
  }

  getActionHistory() {
    return this.recorder.getHistory();
  }
}
