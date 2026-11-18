import { useCallback } from 'react';
import { useSettingsState } from '@/stores';
import { getTTSFactory } from '@/services/tts';
import type { TTSProvider } from '@/services/tts/TTSProvider';
import { isLocalProvider, PROVIDER_LABELS } from '@/services/tts/providerDefaults';

/**
 * Hook that provides a function to get the configured TTS provider.
 * Centralizes the TTS factory configuration that was previously duplicated
 * in multiple places (Project.tsx, SettingsModal.tsx).
 */
export function useTTSProvider() {
  const settings = useSettingsState();

  return useCallback((): TTSProvider => {
    const factory = getTTSFactory({
      openAiApiKey: settings.openAiApiKey,
      geminiApiKey: settings.geminiApiKey,
      elevenLabsApiKey: settings.elevenLabsApiKey,
      playHtApiKey: settings.playHtApiKey,
      playHtUserId: settings.playHtUserId,
      deepgramApiKey: settings.deepgramApiKey,
    });

    const selected = factory.getProvider(settings.defaultProvider);
    if (selected?.isConfigured()) return selected;

    // Don't silently switch providers here: the saved voice ID belongs to the
    // selected provider and would not exist on another one.
    if (!isLocalProvider(settings.defaultProvider)) {
      throw new Error(
        `${PROVIDER_LABELS[settings.defaultProvider]} needs your API key. Add it in Settings, or choose the free on-device Kokoro voice.`
      );
    }
    throw new Error(
      `${PROVIDER_LABELS[settings.defaultProvider]} is not supported in this browser. Choose another voice in Settings.`
    );
  }, [
    settings.openAiApiKey,
    settings.geminiApiKey,
    settings.elevenLabsApiKey,
    settings.playHtApiKey,
    settings.playHtUserId,
    settings.deepgramApiKey,
    settings.defaultProvider,
  ]);
}
