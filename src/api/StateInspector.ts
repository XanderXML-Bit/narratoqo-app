/**
 * Narratoqo StateInspector — Read-only access to the Zustand store state.
 */

import type { Project, PlayerState, Settings, TextChunk, TTSProviderType } from '@/types';

/**
 * Represents the expected shape of persisted Zustand store state.
 * Used for type-safe access when reading from localStorage.
 */
interface PersistedStoreState {
  projects: Project[];
  currentProject: Project | null;
  isPlaying: boolean;
  currentProjectId: string | null;
  currentChunkIndex: number;
  currentTime: number;
  totalDuration: number;
  playbackSpeed: number;
  volume: number;
  highlightMode: 'word' | 'sentence' | 'none';
  isBuffering: boolean;
  error: string | null;
  defaultProvider: TTSProviderType;
  defaultVoiceId: string;
  defaultNarratorVoice: string;
  maxCacheSizeMB: number;
  autoDeleteOldCache: boolean;
  theme: 'dark' | 'light';
}

export class StateInspector {
  // =========================================================================
  // Projects
  // =========================================================================

  getProjects(): Project[] {
    return this.getStoreState()?.projects ?? [];
  }

  getProject(id: string): Project | undefined {
    return this.getProjects().find(p => p.id === id);
  }

  getCurrentProject(): Project | null {
    return this.getStoreState()?.currentProject ?? null;
  }

  getProjectCount(): number {
    return this.getProjects().length;
  }

  // =========================================================================
  // Chunks
  // =========================================================================

  getChunks(projectId: string): TextChunk[] {
    return this.getProject(projectId)?.chunks ?? [];
  }

  getChunkCount(projectId: string): number {
    return this.getChunks(projectId).length;
  }

  getDialogueChunks(projectId: string): TextChunk[] {
    return this.getChunks(projectId).filter(c => c.type === 'dialogue');
  }

  // =========================================================================
  // Player state
  // =========================================================================

  getPlayerState(): Partial<PlayerState> {
    const state = this.getStoreState();
    if (!state) return {};
    return {
      isPlaying: state.isPlaying,
      currentProjectId: state.currentProjectId,
      currentChunkIndex: state.currentChunkIndex,
      currentTime: state.currentTime,
      totalDuration: state.totalDuration,
      playbackSpeed: state.playbackSpeed,
      volume: state.volume,
      highlightMode: state.highlightMode,
      isBuffering: state.isBuffering,
      error: state.error,
    };
  }

  // =========================================================================
  // Settings
  // =========================================================================

  getSettings(): Partial<Settings> {
    const state = this.getStoreState();
    if (!state) return {};
    return {
      defaultProvider: state.defaultProvider,
      defaultVoiceId: state.defaultVoiceId,
      defaultNarratorVoice: state.defaultNarratorVoice,
      maxCacheSizeMB: state.maxCacheSizeMB,
      autoDeleteOldCache: state.autoDeleteOldCache,
      theme: state.theme,
      // Intentionally omit API keys for security
    };
  }

  // =========================================================================
  // Full state
  // =========================================================================

  getFullState(): {
    projects: Project[];
    currentProject: Project | null;
    player: Partial<PlayerState>;
    settings: Partial<Settings>;
  } {
    return {
      projects: this.getProjects(),
      currentProject: this.getCurrentProject(),
      player: this.getPlayerState(),
      settings: this.getSettings(),
    };
  }

  // =========================================================================
  // Internal
  // =========================================================================

  private getStoreState(): PersistedStoreState | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem('narratoqo-store');
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { state?: PersistedStoreState } | PersistedStoreState;
      return ('state' in parsed && parsed.state) ? parsed.state : parsed as PersistedStoreState;
    } catch {
      return null;
    }
  }
}
