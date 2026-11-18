import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Settings, TTSProviderType } from '@/types';

describe('Settings Slice Logic', () => {
  interface TestSettingsState extends Settings {
    setApiKey: (
      provider: 'openRouter' | 'elevenLabs' | 'openAi' | 'playHt' | 'deepgram' | 'gemini',
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

  const initialState: Settings = {
    openRouterApiKey: null,
    elevenLabsApiKey: null,
    openAiApiKey: null,
    playHtApiKey: null,
    playHtUserId: null,
    deepgramApiKey: null,
    geminiApiKey: null,
    defaultProvider: 'openai',
    defaultVoiceId: 'alloy',
    defaultNarratorVoice: 'alloy',
    maxCacheSizeMB: 500,
    autoDeleteOldCache: true,
    theme: 'dark',
  };

  let store: ReturnType<typeof createStore<TestSettingsState>>;

  beforeEach(() => {
    store = createStore<TestSettingsState>((set) => ({
      ...initialState,

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
          set({ [settingKey]: key } as Partial<Settings>);
        }
      },

      setPlayHtUserId: (userId) => set({ playHtUserId: userId }),
      setDefaultProvider: (provider) => set({ defaultProvider: provider }),
      setDefaultVoice: (voiceId) => set({ defaultVoiceId: voiceId }),
      setDefaultNarratorVoice: (voiceId) => set({ defaultNarratorVoice: voiceId }),
      setMaxCacheSize: (sizeMB) => set({ maxCacheSizeMB: sizeMB }),
      setAutoDeleteCache: (enabled) => set({ autoDeleteOldCache: enabled }),
      setTheme: (theme) => set({ theme }),

      clearAllApiKeys: () =>
        set({
          openRouterApiKey: null,
          elevenLabsApiKey: null,
          openAiApiKey: null,
          playHtApiKey: null,
          playHtUserId: null,
          deepgramApiKey: null,
          geminiApiKey: null,
        }),

      loadSettings: (settings) => set(settings as Partial<TestSettingsState>),
    }));
  });

  it('should start with default settings', () => {
    const state = store.getState();
    expect(state.openRouterApiKey).toBeNull();
    expect(state.elevenLabsApiKey).toBeNull();
    expect(state.openAiApiKey).toBeNull();
    expect(state.defaultProvider).toBe('openai');
    expect(state.defaultVoiceId).toBe('alloy');
    expect(state.maxCacheSizeMB).toBe(500);
    expect(state.autoDeleteOldCache).toBe(true);
    expect(state.theme).toBe('dark');
  });

  it('should set OpenRouter API key', () => {
    store.getState().setApiKey('openRouter', 'sk-or-test-key');
    expect(store.getState().openRouterApiKey).toBe('sk-or-test-key');
  });

  it('should set ElevenLabs API key', () => {
    store.getState().setApiKey('elevenLabs', 'xi-test-key');
    expect(store.getState().elevenLabsApiKey).toBe('xi-test-key');
  });

  it('should set OpenAI API key', () => {
    store.getState().setApiKey('openAi', 'sk-test-key');
    expect(store.getState().openAiApiKey).toBe('sk-test-key');
  });

  it('should set PlayHT API key', () => {
    store.getState().setApiKey('playHt', 'playht-key');
    expect(store.getState().playHtApiKey).toBe('playht-key');
  });

  it('should set Deepgram API key', () => {
    store.getState().setApiKey('deepgram', 'dg-key');
    expect(store.getState().deepgramApiKey).toBe('dg-key');
  });

  it('should set Gemini API key', () => {
    store.getState().setApiKey('gemini', 'AIza-key');
    expect(store.getState().geminiApiKey).toBe('AIza-key');
  });

  it('should clear an API key by setting null', () => {
    store.getState().setApiKey('openAi', 'sk-test');
    expect(store.getState().openAiApiKey).toBe('sk-test');

    store.getState().setApiKey('openAi', null);
    expect(store.getState().openAiApiKey).toBeNull();
  });

  it('should set PlayHT user ID', () => {
    store.getState().setPlayHtUserId('user-123');
    expect(store.getState().playHtUserId).toBe('user-123');
  });

  it('should set default provider', () => {
    store.getState().setDefaultProvider('elevenlabs');
    expect(store.getState().defaultProvider).toBe('elevenlabs');

    store.getState().setDefaultProvider('gemini');
    expect(store.getState().defaultProvider).toBe('gemini');
  });

  it('should set default voice', () => {
    store.getState().setDefaultVoice('nova');
    expect(store.getState().defaultVoiceId).toBe('nova');
  });

  it('should set default narrator voice', () => {
    store.getState().setDefaultNarratorVoice('shimmer');
    expect(store.getState().defaultNarratorVoice).toBe('shimmer');
  });

  it('should set max cache size', () => {
    store.getState().setMaxCacheSize(1000);
    expect(store.getState().maxCacheSizeMB).toBe(1000);
  });

  it('should set auto delete cache', () => {
    store.getState().setAutoDeleteCache(false);
    expect(store.getState().autoDeleteOldCache).toBe(false);
  });

  it('should set theme', () => {
    store.getState().setTheme('light');
    expect(store.getState().theme).toBe('light');

    store.getState().setTheme('dark');
    expect(store.getState().theme).toBe('dark');
  });

  it('should clear all API keys', () => {
    store.getState().setApiKey('openAi', 'sk-test');
    store.getState().setApiKey('elevenLabs', 'xi-test');
    store.getState().setApiKey('gemini', 'AIza-test');
    store.getState().setPlayHtUserId('user-123');

    store.getState().clearAllApiKeys();

    const state = store.getState();
    expect(state.openRouterApiKey).toBeNull();
    expect(state.elevenLabsApiKey).toBeNull();
    expect(state.openAiApiKey).toBeNull();
    expect(state.playHtApiKey).toBeNull();
    expect(state.playHtUserId).toBeNull();
    expect(state.deepgramApiKey).toBeNull();
    expect(state.geminiApiKey).toBeNull();
  });

  it('should preserve non-key settings when clearing API keys', () => {
    store.getState().setTheme('light');
    store.getState().setDefaultProvider('elevenlabs');
    store.getState().setApiKey('openAi', 'sk-test');

    store.getState().clearAllApiKeys();

    expect(store.getState().theme).toBe('light');
    expect(store.getState().defaultProvider).toBe('elevenlabs');
  });

  it('should load partial settings', () => {
    store.getState().loadSettings({
      theme: 'light',
      defaultProvider: 'gemini',
      maxCacheSizeMB: 1000,
    });

    const state = store.getState();
    expect(state.theme).toBe('light');
    expect(state.defaultProvider).toBe('gemini');
    expect(state.maxCacheSizeMB).toBe(1000);
    // Other settings remain at defaults
    expect(state.defaultVoiceId).toBe('alloy');
  });
});
