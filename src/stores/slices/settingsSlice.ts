import type { StateCreator } from 'zustand';
import type { StoreState } from '../index';
import type { Settings, TTSProviderType } from '@/types';

export interface SettingsActions {
  setApiKey: (
    provider:
      | 'openRouter'
      | 'elevenLabs'
      | 'openAi'
      | 'playHt'
      | 'deepgram'
      | 'gemini',
    key: string | null
  ) => void;
  setPlayHtUserId: (userId: string | null) => void;
  setDefaultProvider: (provider: TTSProviderType) => void;
  setDefaultVoice: (voiceId: string) => void;
  setDefaultNarratorVoice: (voiceId: string) => void;
  setMaxCacheSize: (sizeMB: number) => void;
  setAutoDeleteCache: (enabled: boolean) => void;
  setTheme: (theme: 'dark' | 'light') => void;
  clearAllApiKeys: () => void;
  loadSettings: (settings: Partial<Settings>) => void;
}

export type SettingsSlice = Settings & SettingsActions;

const initialSettingsState: Settings = {
  openRouterApiKey: null,
  elevenLabsApiKey: null,
  openAiApiKey: null,
  playHtApiKey: null,
  playHtUserId: null,
  deepgramApiKey: null,
  geminiApiKey: null,
  defaultProvider: 'kokoro',
  defaultVoiceId: 'af_heart',
  defaultNarratorVoice: 'af_heart',
  maxCacheSizeMB: 500,
  autoDeleteOldCache: true,
  theme: 'dark',
};

export const createSettingsSlice: StateCreator<
  StoreState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  SettingsSlice
> = (set) => ({
  ...initialSettingsState,

  setApiKey: (provider, key) => {
    const keyMap: Record<string, keyof Settings> = {
      openRouter: 'openRouterApiKey',
      elevenLabs: 'elevenLabsApiKey',
      openAi: 'openAiApiKey',
      playHt: 'playHtApiKey',
      deepgram: 'deepgramApiKey',
      gemini: 'geminiApiKey',
    };
    const settingKey = keyMap[provider];
    if (settingKey) {
      set({ [settingKey]: key } as Partial<Settings>, false, `settings/setApiKey/${provider}`);
    }
  },

  setPlayHtUserId: (userId) =>
    set({ playHtUserId: userId }, false, 'settings/setPlayHtUserId'),

  setDefaultProvider: (provider) =>
    set({ defaultProvider: provider }, false, 'settings/setDefaultProvider'),

  setDefaultVoice: (voiceId) =>
    set({ defaultVoiceId: voiceId }, false, 'settings/setDefaultVoice'),

  setDefaultNarratorVoice: (voiceId) =>
    set(
      { defaultNarratorVoice: voiceId },
      false,
      'settings/setDefaultNarratorVoice'
    ),

  setMaxCacheSize: (sizeMB) =>
    set({ maxCacheSizeMB: sizeMB }, false, 'settings/setMaxCacheSize'),

  setAutoDeleteCache: (enabled) =>
    set({ autoDeleteOldCache: enabled }, false, 'settings/setAutoDeleteCache'),

  setTheme: (theme) => set({ theme }, false, 'settings/setTheme'),

  clearAllApiKeys: () =>
    set(
      {
        openRouterApiKey: null,
        elevenLabsApiKey: null,
        openAiApiKey: null,
        playHtApiKey: null,
        playHtUserId: null,
        deepgramApiKey: null,
        geminiApiKey: null,
      },
      false,
      'settings/clearAllApiKeys'
    ),

  loadSettings: (settings) =>
    set(settings as Partial<SettingsSlice>, false, 'settings/loadSettings'),
});
