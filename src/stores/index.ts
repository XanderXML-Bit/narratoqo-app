import { create } from 'zustand';
import { devtools, persist, createJSONStorage } from 'zustand/middleware';
import type { StateStorage } from 'zustand/middleware';
import { useShallow } from 'zustand/react/shallow';
import { createPlayerSlice, type PlayerSlice } from './slices/playerSlice';
import { createProjectSlice, type ProjectSlice } from './slices/projectSlice';
import { createSettingsSlice, type SettingsSlice } from './slices/settingsSlice';
import { createUISlice, type UISlice } from './slices/uiSlice';

// Combined store type
export type StoreState = PlayerSlice & ProjectSlice & SettingsSlice & UISlice;

// API key fields that should be stored securely (sessionStorage)
const SENSITIVE_KEYS = [
  'openRouterApiKey',
  'elevenLabsApiKey',
  'openAiApiKey',
  'playHtApiKey',
  'playHtUserId',
  'deepgramApiKey',
  'geminiApiKey',
];

/**
 * Hybrid storage adapter that:
 * - Stores API keys in sessionStorage (clears when browser closes - more secure)
 * - Stores preferences in localStorage (persists across sessions)
 *
 * Security: API keys are not persisted to disk, reducing exposure to:
 * - Malware scanning localStorage files
 * - Browser sync uploading keys to cloud
 * - Keys lingering after user thinks they've "logged out"
 */
const hybridStorage: StateStorage = {
  getItem: (name: string): string | null => {
    try {
      // Get base state from localStorage (preferences)
      const localData = localStorage.getItem(name);
      const sessionData = sessionStorage.getItem(`${name}-keys`);

      if (!localData && !sessionData) return null;

      const localState = localData ? JSON.parse(localData) : { state: {} };
      const sessionState = sessionData ? JSON.parse(sessionData) : {};

      // Merge: preferences from localStorage + API keys from sessionStorage
      return JSON.stringify({
        ...localState,
        state: {
          ...localState.state,
          ...sessionState,
        },
      });
    } catch (e) {
      console.warn('[Store] Failed to read from storage:', e);
      return null;
    }
  },

  setItem: (name: string, value: string): void => {
    try {
      const data = JSON.parse(value);
      const state = data.state || {};

      // Separate sensitive keys from preferences
      const sensitiveData: Record<string, unknown> = {};
      const preferencesData: Record<string, unknown> = {};

      for (const [key, val] of Object.entries(state)) {
        if (SENSITIVE_KEYS.includes(key)) {
          sensitiveData[key] = val;
        } else {
          preferencesData[key] = val;
        }
      }

      // Store API keys in sessionStorage (clears on browser close)
      sessionStorage.setItem(`${name}-keys`, JSON.stringify(sensitiveData));

      // Store preferences in localStorage (persists)
      localStorage.setItem(name, JSON.stringify({
        ...data,
        state: preferencesData,
      }));
    } catch (e) {
      console.warn('[Store] Failed to write to storage:', e);
    }
  },

  removeItem: (name: string): void => {
    localStorage.removeItem(name);
    sessionStorage.removeItem(`${name}-keys`);
  },
};

// Use the hybrid storage adapter
const customStorage = createJSONStorage(() => hybridStorage);

// Create the combined store
export const useStore = create<StoreState>()(
  devtools(
    persist(
      (...a) => ({
        ...createPlayerSlice(...a),
        ...createProjectSlice(...a),
        ...createSettingsSlice(...a),
        ...createUISlice(...a),
      }),
      {
        name: 'narratoqo-store',
        storage: customStorage,
        partialize: (state) => ({
          // Player preferences (persist)
          playbackSpeed: state.playbackSpeed,
          volume: state.volume,
          highlightMode: state.highlightMode,

          // Settings (persist)
          openRouterApiKey: state.openRouterApiKey,
          elevenLabsApiKey: state.elevenLabsApiKey,
          openAiApiKey: state.openAiApiKey,
          playHtApiKey: state.playHtApiKey,
          playHtUserId: state.playHtUserId,
          deepgramApiKey: state.deepgramApiKey,
          geminiApiKey: state.geminiApiKey,
          defaultProvider: state.defaultProvider,
          defaultVoiceId: state.defaultVoiceId,
          defaultNarratorVoice: state.defaultNarratorVoice,
          maxCacheSizeMB: state.maxCacheSizeMB,
          autoDeleteOldCache: state.autoDeleteOldCache,
          theme: state.theme,

          // UI preferences (persist)
          isSidebarOpen: state.isSidebarOpen,
        }),
      }
    ),
    { name: 'Narratoqo' }
  )
);

// Typed selectors using useShallow for proper equality checks
export const usePlayerState = () =>
  useStore(
    useShallow((state) => ({
      isPlaying: state.isPlaying,
      currentProjectId: state.currentProjectId,
      currentChunkIndex: state.currentChunkIndex,
      currentTime: state.currentTime,
      totalDuration: state.totalDuration,
      playbackSpeed: state.playbackSpeed,
      volume: state.volume,
      currentWordIndex: state.currentWordIndex,
      highlightMode: state.highlightMode,
      isBuffering: state.isBuffering,
      error: state.error,
    }))
  );

export const usePlayerActions = () =>
  useStore(
    useShallow((state) => ({
      play: state.play,
      pause: state.pause,
      togglePlay: state.togglePlay,
      seek: state.seek,
      seekToChunk: state.seekToChunk,
      setSpeed: state.setSpeed,
      setVolume: state.setVolume,
      setHighlightMode: state.setHighlightMode,
      setPlayerProjectId: state.setPlayerProjectId,
      updateCurrentTime: state.updateCurrentTime,
      updateCurrentWord: state.updateCurrentWord,
      setTotalDuration: state.setTotalDuration,
      setBuffering: state.setBuffering,
      setError: state.setError,
      resetPlayer: state.resetPlayer,
    }))
  );

export const useProjectState = () =>
  useStore(
    useShallow((state) => ({
      projects: state.projects,
      currentProject: state.currentProject,
      isLoading: state.isLoading,
    }))
  );

export const useProjectActions = () =>
  useStore(
    useShallow((state) => ({
      setProjects: state.setProjects,
      addProject: state.addProject,
      updateProject: state.updateProject,
      removeProject: state.removeProject,
      setCurrentProject: state.setCurrentProject,
      updateChunks: state.updateChunks,
      updateLastPosition: state.updateLastPosition,
      setProjectLoading: state.setProjectLoading,
    }))
  );

export const useSettingsState = () =>
  useStore(
    useShallow((state) => ({
      openRouterApiKey: state.openRouterApiKey,
      elevenLabsApiKey: state.elevenLabsApiKey,
      openAiApiKey: state.openAiApiKey,
      playHtApiKey: state.playHtApiKey,
      playHtUserId: state.playHtUserId,
      deepgramApiKey: state.deepgramApiKey,
      geminiApiKey: state.geminiApiKey,
      defaultProvider: state.defaultProvider,
      defaultVoiceId: state.defaultVoiceId,
      defaultNarratorVoice: state.defaultNarratorVoice,
      maxCacheSizeMB: state.maxCacheSizeMB,
      autoDeleteOldCache: state.autoDeleteOldCache,
      theme: state.theme,
    }))
  );

export const useSettingsActions = () =>
  useStore(
    useShallow((state) => ({
      setApiKey: state.setApiKey,
      setPlayHtUserId: state.setPlayHtUserId,
      setDefaultProvider: state.setDefaultProvider,
      setDefaultVoice: state.setDefaultVoice,
      setDefaultNarratorVoice: state.setDefaultNarratorVoice,
      setMaxCacheSize: state.setMaxCacheSize,
      setAutoDeleteCache: state.setAutoDeleteCache,
      setTheme: state.setTheme,
      clearAllApiKeys: state.clearAllApiKeys,
      loadSettings: state.loadSettings,
    }))
  );

export const useUIState = () =>
  useStore(
    useShallow((state) => ({
      isSidebarOpen: state.isSidebarOpen,
      isSettingsOpen: state.isSettingsOpen,
      isImportModalOpen: state.isImportModalOpen,
      toasts: state.toasts,
      importState: state.importState,
    }))
  );

export const useUIActions = () =>
  useStore(
    useShallow((state) => ({
      toggleSidebar: state.toggleSidebar,
      setSidebarOpen: state.setSidebarOpen,
      toggleSettings: state.toggleSettings,
      setSettingsOpen: state.setSettingsOpen,
      toggleImportModal: state.toggleImportModal,
      setImportModalOpen: state.setImportModalOpen,
      addToast: state.addToast,
      removeToast: state.removeToast,
      clearToasts: state.clearToasts,
      setImportState: state.setImportState,
      resetImportState: state.resetImportState,
    }))
  );

// Helper to check if API key is configured for a provider
export const useHasApiKey = (provider: 'openRouter' | 'elevenLabs' | 'openAi' | 'playHt' | 'deepgram' | 'gemini') => {
  return useStore((state) => {
    switch (provider) {
      case 'openRouter':
        return !!state.openRouterApiKey;
      case 'elevenLabs':
        return !!state.elevenLabsApiKey;
      case 'openAi':
        return !!state.openAiApiKey;
      case 'playHt':
        return !!state.playHtApiKey && !!state.playHtUserId;
      case 'deepgram':
        return !!state.deepgramApiKey;
      case 'gemini':
        return !!state.geminiApiKey;
      default:
        return false;
    }
  });
};
