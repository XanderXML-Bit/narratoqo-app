import type { TTSProviderType, Voice } from '@/types';
import type { TTSProvider } from './TTSProvider';
import { OpenAIProvider } from './OpenAIProvider';
import { ElevenLabsProvider } from './ElevenLabsProvider';
import { PlayHTProvider } from './PlayHTProvider';
import { DeepgramProvider } from './DeepgramProvider';
import { GeminiProvider } from './GeminiProvider';
import { WebSpeechProvider } from './WebSpeechProvider';
import { KokoroProvider } from './KokoroProvider';
import { PiperProvider } from './PiperProvider';

interface ProviderConfig {
  openRouterApiKey?: string | null;
  openAiApiKey?: string | null;
  elevenLabsApiKey?: string | null;
  playHtApiKey?: string | null;
  playHtUserId?: string | null;
  deepgramApiKey?: string | null;
  geminiApiKey?: string | null;
}

const CONFIG_KEYS: (keyof ProviderConfig)[] = [
  'openAiApiKey',
  'geminiApiKey',
  'elevenLabsApiKey',
  'playHtApiKey',
  'playHtUserId',
  'deepgramApiKey',
];

const CLOUD_PROVIDERS: TTSProviderType[] = ['openai', 'gemini', 'elevenlabs', 'playht', 'deepgram'];

/**
 * Factory for creating and managing TTS providers.
 */
export class TTSProviderFactory {
  private providers: Map<TTSProviderType, TTSProvider> = new Map();
  private voiceCache: Map<TTSProviderType, Voice[]> = new Map();

  constructor(private config: ProviderConfig) {
    this.initializeCloudProviders();
    this.initializeLocalProviders();
  }

  /** Cloud providers depend on the configured keys. */
  private initializeCloudProviders(): void {
    // OpenAI TTS - requires direct OpenAI API key (OpenRouter doesn't support TTS)
    if (this.config.openAiApiKey) {
      this.providers.set(
        'openai',
        new OpenAIProvider(this.config.openAiApiKey, {
          model: 'tts-1-hd', // Highest quality model
        })
      );
    }

    // Gemini TTS - Google's expressive TTS
    if (this.config.geminiApiKey) {
      this.providers.set(
        'gemini',
        new GeminiProvider(this.config.geminiApiKey, {
          model: 'gemini-2.5-flash-preview-tts',
        })
      );
    }

    // ElevenLabs (requires direct API key)
    if (this.config.elevenLabsApiKey) {
      this.providers.set(
        'elevenlabs',
        new ElevenLabsProvider(this.config.elevenLabsApiKey)
      );
    }

    // PlayHT
    if (this.config.playHtApiKey && this.config.playHtUserId) {
      this.providers.set(
        'playht',
        new PlayHTProvider(this.config.playHtApiKey, this.config.playHtUserId)
      );
    }

    // Deepgram
    if (this.config.deepgramApiKey) {
      this.providers.set('deepgram', new DeepgramProvider(this.config.deepgramApiKey));
    }

  }

  /**
   * Browser-based providers (always available if supported, no API key needed). They hold
   * loaded models, so they are created once and survive key changes.
   */
  private initializeLocalProviders(): void {
    const webSpeechProvider = new WebSpeechProvider();
    if (webSpeechProvider.isSupported()) {
      this.providers.set('webspeech', webSpeechProvider);
    }

    const kokoroProvider = new KokoroProvider();
    if (kokoroProvider.isSupported()) {
      this.providers.set('kokoro', kokoroProvider);
    }

    const piperProvider = new PiperProvider();
    if (piperProvider.isSupported()) {
      this.providers.set('piper', piperProvider);
    }
  }

  /**
   * Update provider configuration and reinitialize.
   * Disposes old providers to clean up blob URLs.
   */
  updateConfig(config: ProviderConfig): void {
    const next = { ...this.config, ...config };
    // Callers pass the full config on every synthesis. Rebuilding when nothing changed
    // threw away the loaded on-device model, so Kokoro reloaded (and showed its download
    // banner) before every segment.
    if (CONFIG_KEYS.every((key) => next[key] === this.config[key])) return;
    this.config = next;

    // Keys changed: rebuild only the cloud providers. Local providers keep their models.
    for (const type of CLOUD_PROVIDERS) {
      const provider = this.providers.get(type);
      if (provider && 'dispose' in provider && typeof provider.dispose === 'function') {
        provider.dispose();
      }
      this.providers.delete(type);
      this.voiceCache.delete(type);
    }
    this.initializeCloudProviders();
  }

  /**
   * Dispose all providers and clean up resources.
   * Call this when the factory is no longer needed.
   */
  dispose(): void {
    this.disposeAllProviders();
    this.providers.clear();
    this.voiceCache.clear();
  }

  /**
   * Dispose all providers (internal helper).
   */
  private disposeAllProviders(): void {
    for (const provider of this.providers.values()) {
      if ('dispose' in provider && typeof provider.dispose === 'function') {
        provider.dispose();
      }
    }
  }

  /**
   * Get a specific TTS provider.
   */
  getProvider(type: TTSProviderType): TTSProvider | undefined {
    return this.providers.get(type);
  }

  /**
   * Get the best available provider based on priority.
   * Priority: API providers first (by quality), then local providers.
   * ElevenLabs > OpenAI > Gemini > Kokoro (best local) > PlayHT > Deepgram > Piper > WebSpeech
   */
  getBestProvider(): TTSProvider | undefined {
    const priority: TTSProviderType[] = [
      'elevenlabs',  // Best API quality
      'openai',
      'gemini',
      'kokoro',      // Best local quality (English)
      'playht',
      'deepgram',
      'piper',       // Multi-language local
      'webspeech',   // Universal fallback
    ];

    for (const type of priority) {
      const provider = this.providers.get(type);
      if (provider?.isConfigured()) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Get a provider that supports word timing.
   */
  getWordTimingProvider(): TTSProvider | undefined {
    const provider = this.providers.get('elevenlabs');
    if (provider?.isConfigured()) {
      return provider;
    }
    return undefined;
  }

  /**
   * Check if a specific provider is available and configured.
   */
  isProviderAvailable(type: TTSProviderType): boolean {
    const provider = this.providers.get(type);
    return provider?.isConfigured() ?? false;
  }

  /**
   * Get all available (configured) providers.
   */
  getAvailableProviders(): TTSProviderType[] {
    const available: TTSProviderType[] = [];
    for (const [type, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        available.push(type);
      }
    }
    return available;
  }

  /**
   * Get voices for a specific provider (cached).
   */
  async getVoices(type: TTSProviderType): Promise<Voice[]> {
    // Check cache first
    const cached = this.voiceCache.get(type);
    if (cached) {
      return cached;
    }

    const provider = this.providers.get(type);
    if (!provider) {
      return [];
    }

    const voices = await provider.getVoices();
    this.voiceCache.set(type, voices);
    return voices;
  }

  /**
   * Get all voices from all configured providers.
   */
  async getAllVoices(): Promise<Voice[]> {
    const allVoices: Voice[] = [];

    for (const type of this.providers.keys()) {
      const voices = await this.getVoices(type);
      allVoices.push(...voices);
    }

    return allVoices;
  }

  /**
   * Estimate total cost for a given text across providers.
   * Browser providers (webspeech, kokoro, piper) are always free.
   */
  estimateCosts(text: string): Record<TTSProviderType, number> {
    const charCount = text.length;
    const costs: Record<TTSProviderType, number> = {
      openai: 0,
      elevenlabs: 0,
      playht: 0,
      deepgram: 0,
      gemini: 0,
      webspeech: 0, // Always free
      kokoro: 0,    // Always free
      piper: 0,     // Always free
    };

    for (const [type, provider] of this.providers.entries()) {
      if (provider.isConfigured()) {
        costs[type] = provider.estimateCost(charCount);
      }
    }

    return costs;
  }

  /**
   * Get the cheapest provider for a given text.
   */
  getCheapestProvider(text: string): TTSProviderType | undefined {
    const costs = this.estimateCosts(text);
    let cheapest: TTSProviderType | undefined;
    let lowestCost = Infinity;

    for (const [type, cost] of Object.entries(costs)) {
      if (cost > 0 && cost < lowestCost) {
        lowestCost = cost;
        cheapest = type as TTSProviderType;
      }
    }

    return cheapest;
  }

  /**
   * Clear voice cache (useful after config changes).
   */
  clearVoiceCache(): void {
    this.voiceCache.clear();
  }

  /**
   * Get all available browser-based providers (free, offline-capable).
   */
  getBrowserProviders(): TTSProviderType[] {
    const browserTypes: TTSProviderType[] = ['webspeech', 'kokoro', 'piper'];
    return browserTypes.filter((type) => {
      const provider = this.providers.get(type);
      return provider?.isConfigured();
    });
  }

  /**
   * Get the best free provider (browser-based).
   * Priority: Kokoro (best quality) > Piper (multi-language) > WebSpeech (universal)
   */
  getBestFreeProvider(): TTSProvider | undefined {
    const priority: TTSProviderType[] = ['kokoro', 'piper', 'webspeech'];

    for (const type of priority) {
      const provider = this.providers.get(type);
      if (provider?.isConfigured()) {
        return provider;
      }
    }

    return undefined;
  }

  /**
   * Check if any free (browser-based) provider is available.
   */
  hasFreeProvider(): boolean {
    return this.getBrowserProviders().length > 0;
  }
}

// Singleton factory instance
let factoryInstance: TTSProviderFactory | null = null;

/** Get or create the singleton TTSProviderFactory instance. */
export function getTTSFactory(config?: ProviderConfig): TTSProviderFactory {
  if (!factoryInstance && config) {
    factoryInstance = new TTSProviderFactory(config);
  } else if (factoryInstance && config) {
    factoryInstance.updateConfig(config);
  } else if (!factoryInstance) {
    factoryInstance = new TTSProviderFactory({});
  }

  return factoryInstance;
}

/** Dispose and reset the singleton TTSProviderFactory instance. */
export function resetTTSFactory(): void {
  if (factoryInstance) {
    factoryInstance.dispose();
    factoryInstance = null;
  }
}
