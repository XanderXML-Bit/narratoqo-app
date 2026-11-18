import { useState, useRef, useEffect } from 'react';
import { X, Key, Save, Eye, EyeOff, Mic, Pause, Loader2, Volume2, Globe, Download, Check } from 'lucide-react';
import { useUIState, useUIActions, useSettingsState, useSettingsActions } from '@/stores';
import { getTTSFactory, WebSpeechProvider, KokoroProvider, PiperProvider } from '@/services/tts';
import type { Voice, TTSProviderType } from '@/types';
import { getBlobURLManager } from '@/services/audio/BlobURLManager';
import { useDialogFocus } from '@/hooks/useDialogFocus';

const PREVIEW_TEXT = "Hello! This is a preview of how this voice sounds. I hope you enjoy listening to me read your content.";

export function SettingsModal() {
  const { isSettingsOpen } = useUIState();
  const { setSettingsOpen, addToast } = useUIActions();
  const settings = useSettingsState();
  const { setApiKey, setPlayHtUserId, setDefaultProvider, setDefaultVoice } = useSettingsActions();

  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});
  const [selectedVoice, setSelectedVoice] = useState(settings.defaultVoiceId || '');
  const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // Local state for form inputs
  const [openAiKey, setOpenAiKey] = useState(settings.openAiApiKey || '');
  const [geminiKey, setGeminiKey] = useState(settings.geminiApiKey || '');
  const [elevenLabsKey, setElevenLabsKey] = useState(settings.elevenLabsApiKey || '');
  const [playHtKey, setPlayHtKey] = useState(settings.playHtApiKey || '');
  const [playHtUser, setPlayHtUser] = useState(settings.playHtUserId || '');
  const [deepgramKey, setDeepgramKey] = useState(settings.deepgramApiKey || '');

  // Browser provider state
  const [webSpeechSupported, setWebSpeechSupported] = useState(false);
  const [kokoroSupported, setKokoroSupported] = useState(false);
  const [piperSupported, setPiperSupported] = useState(false);
  const [kokoroReady, setKokoroReady] = useState(false);
  const [piperReady, setPiperReady] = useState(false);
  const [kokoroDownloading, setKokoroDownloading] = useState(false);
  const [piperDownloading, setPiperDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);

  // Clean up audio on unmount to prevent orphaned playback
  useEffect(() => {
    return () => {
      if (audioRef.current) {
        audioRef.current.pause();
        if (audioRef.current.src.startsWith('blob:')) {
          getBlobURLManager().revokeByUrl(audioRef.current.src);
        }
        audioRef.current = null;
      }
    };
  }, []);

  // Check browser TTS support on mount
  useEffect(() => {
    const webSpeech = new WebSpeechProvider();
    const kokoro = new KokoroProvider();
    const piper = new PiperProvider();

    setWebSpeechSupported(webSpeech.isSupported());
    setKokoroSupported(kokoro.isSupported());
    setPiperSupported(piper.isSupported());

    // Ready = loaded in the shared provider, or already in the browser cache.
    const shared = getTTSFactory();
    const sharedKokoro = shared.getProvider('kokoro') as KokoroProvider | undefined;
    Promise.all([sharedKokoro?.isReady() ?? Promise.resolve(false), KokoroProvider.isCached()]).then(
      ([loaded, cached]) => setKokoroReady(loaded || cached)
    );
    ((shared.getProvider('piper') as PiperProvider | undefined)?.isReady() ?? Promise.resolve(false)).then(setPiperReady);
  }, []);

  // Default voices for each provider (static list to avoid API calls)
  const defaultVoices: Record<TTSProviderType, Voice[]> = {
    openai: [
      { id: 'alloy', name: 'Alloy (Neutral)', provider: 'openai', language: 'en', gender: 'neutral' },
      { id: 'ash', name: 'Ash (Male)', provider: 'openai', language: 'en', gender: 'male' },
      { id: 'ballad', name: 'Ballad (Warm)', provider: 'openai', language: 'en', gender: 'male' },
      { id: 'coral', name: 'Coral (Female)', provider: 'openai', language: 'en', gender: 'female' },
      { id: 'echo', name: 'Echo (Male)', provider: 'openai', language: 'en', gender: 'male' },
      { id: 'fable', name: 'Fable (British)', provider: 'openai', language: 'en', gender: 'neutral' },
      { id: 'onyx', name: 'Onyx (Deep Male)', provider: 'openai', language: 'en', gender: 'male' },
      { id: 'nova', name: 'Nova (Female)', provider: 'openai', language: 'en', gender: 'female' },
      { id: 'sage', name: 'Sage (Wise)', provider: 'openai', language: 'en', gender: 'female' },
      { id: 'shimmer', name: 'Shimmer (Female)', provider: 'openai', language: 'en', gender: 'female' },
      { id: 'verse', name: 'Verse (Dramatic)', provider: 'openai', language: 'en', gender: 'male' },
    ],
    gemini: [
      { id: 'Kore', name: 'Kore (Warm)', provider: 'gemini', language: 'en', gender: 'female' },
      { id: 'Puck', name: 'Puck (Playful)', provider: 'gemini', language: 'en', gender: 'male' },
      { id: 'Charon', name: 'Charon (Deep)', provider: 'gemini', language: 'en', gender: 'male' },
      { id: 'Fenrir', name: 'Fenrir (Bold)', provider: 'gemini', language: 'en', gender: 'male' },
      { id: 'Aoede', name: 'Aoede (Melodic)', provider: 'gemini', language: 'en', gender: 'female' },
      { id: 'Leda', name: 'Leda (Gentle)', provider: 'gemini', language: 'en', gender: 'female' },
      { id: 'Orus', name: 'Orus (Narrative)', provider: 'gemini', language: 'en', gender: 'male' },
      { id: 'Zephyr', name: 'Zephyr (Airy)', provider: 'gemini', language: 'en', gender: 'neutral' },
    ],
    elevenlabs: [
      { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam (Male)', provider: 'elevenlabs', language: 'en', gender: 'male' },
      { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Sarah (Female)', provider: 'elevenlabs', language: 'en', gender: 'female' },
      { id: 'onwK4e9ZLuTAKqWW03F9', name: 'Daniel (Male)', provider: 'elevenlabs', language: 'en', gender: 'male' },
      { id: 'XB0fDUnXU5powFXDhCwa', name: 'Charlotte (Female)', provider: 'elevenlabs', language: 'en', gender: 'female' },
      { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel (Female)', provider: 'elevenlabs', language: 'en', gender: 'female' },
    ],
    playht: [
      { id: 's3://voice-cloning-zero-shot/d9ff78ba-d016-47f6-b0ef-dd630f59414e/female-cs/manifest.json', name: 'Jennifer (Female)', provider: 'playht', language: 'en', gender: 'female' },
      { id: 's3://voice-cloning-zero-shot/820da3d2-3a3b-42e7-844d-e68db835a206/male-cs/manifest.json', name: 'Michael (Male)', provider: 'playht', language: 'en', gender: 'male' },
    ],
    deepgram: [
      { id: 'aura-asteria-en', name: 'Asteria (Female)', provider: 'deepgram', language: 'en', gender: 'female' },
      { id: 'aura-luna-en', name: 'Luna (Female)', provider: 'deepgram', language: 'en', gender: 'female' },
      { id: 'aura-stella-en', name: 'Stella (Female)', provider: 'deepgram', language: 'en', gender: 'female' },
      { id: 'aura-athena-en', name: 'Athena (Female)', provider: 'deepgram', language: 'en', gender: 'female' },
      { id: 'aura-hera-en', name: 'Hera (Female)', provider: 'deepgram', language: 'en', gender: 'female' },
      { id: 'aura-orion-en', name: 'Orion (Male)', provider: 'deepgram', language: 'en', gender: 'male' },
      { id: 'aura-arcas-en', name: 'Arcas (Male)', provider: 'deepgram', language: 'en', gender: 'male' },
      { id: 'aura-perseus-en', name: 'Perseus (Male)', provider: 'deepgram', language: 'en', gender: 'male' },
    ],
    // Browser-based providers (free, offline-capable)
    webspeech: [], // Populated dynamically from browser
    kokoro: KokoroProvider.VOICES,
    piper: PiperProvider.VOICES,
  };

  const currentVoices = defaultVoices[settings.defaultProvider as TTSProviderType] || [];

  // Check if provider is browser-based (no API key needed)
  const isBrowserProvider = (provider: TTSProviderType) => {
    return ['webspeech', 'kokoro', 'piper'].includes(provider);
  };

  // Get current API key for selected provider (browser providers return 'browser')
  const getCurrentApiKey = () => {
    if (isBrowserProvider(settings.defaultProvider)) {
      return 'browser'; // Special value for browser providers
    }
    switch (settings.defaultProvider) {
      case 'openai': return openAiKey;
      case 'gemini': return geminiKey;
      case 'elevenlabs': return elevenLabsKey;
      case 'playht': return playHtKey;
      case 'deepgram': return deepgramKey;
      default: return '';
    }
  };

  // Preview voice
  const handlePreviewVoice = async () => {
    // If already playing, stop
    if (isPreviewPlaying && audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
      setIsPreviewPlaying(false);
      return;
    }

    const apiKey = getCurrentApiKey();
    if (!apiKey) {
      addToast({ type: 'error', message: 'Please enter an API key first' });
      return;
    }

    if (!selectedVoice) {
      addToast({ type: 'error', message: 'Please select a voice first' });
      return;
    }

    setIsPreviewLoading(true);

    try {
      const factory = getTTSFactory({
        openAiApiKey: settings.defaultProvider === 'openai' ? openAiKey : undefined,
        geminiApiKey: settings.defaultProvider === 'gemini' ? geminiKey : undefined,
        elevenLabsApiKey: settings.defaultProvider === 'elevenlabs' ? elevenLabsKey : undefined,
        playHtApiKey: settings.defaultProvider === 'playht' ? playHtKey : undefined,
        playHtUserId: settings.defaultProvider === 'playht' ? playHtUser : undefined,
        deepgramApiKey: settings.defaultProvider === 'deepgram' ? deepgramKey : undefined,
      });

      const provider = factory.getProvider(settings.defaultProvider);
      if (!provider) {
        throw new Error('Provider not configured');
      }

      const result = await provider.synthesize({
        text: PREVIEW_TEXT,
        voiceId: selectedVoice,
      });

      // Create audio element and play
      const url = getBlobURLManager().create(result.audioBlob, 'voice-preview');
      if (audioRef.current) {
        audioRef.current.pause();
        getBlobURLManager().revokeByUrl(audioRef.current.src);
      }

      const audio = new Audio(url);
      audioRef.current = audio;

      audio.onended = () => {
        setIsPreviewPlaying(false);
        getBlobURLManager().revokeByUrl(url);
      };

      audio.onerror = () => {
        setIsPreviewPlaying(false);
        getBlobURLManager().revokeByUrl(url);
        addToast({ type: 'error', message: 'Failed to play preview' });
      };

      await audio.play();
      setIsPreviewPlaying(true);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to generate preview';
      addToast({ type: 'error', message });
    } finally {
      setIsPreviewLoading(false);
    }
  };

  // Stop preview when closing modal
  const handleClose = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      // Revoke blob URL to prevent memory leak
      if (audioRef.current.src.startsWith('blob:')) {
        getBlobURLManager().revokeByUrl(audioRef.current.src);
      }
      audioRef.current = null;
      setIsPreviewPlaying(false);
    }
    setSettingsOpen(false);
  };

  useDialogFocus(dialogRef, isSettingsOpen, handleClose);

  if (!isSettingsOpen) return null;

  const handleSave = () => {
    setApiKey('openAi', openAiKey || null);
    setApiKey('gemini', geminiKey || null);
    setApiKey('elevenLabs', elevenLabsKey || null);
    setApiKey('playHt', playHtKey || null);
    setPlayHtUserId(playHtUser || null);
    setApiKey('deepgram', deepgramKey || null);
    if (selectedVoice) {
      setDefaultVoice(selectedVoice);
    }

    addToast({ type: 'success', message: 'Settings saved!' });
    handleClose();
  };

  // Reset voice selection when provider changes
  const handleProviderChange = (provider: string) => {
    // Stop any playing preview
    if (audioRef.current) {
      audioRef.current.pause();
      setIsPreviewPlaying(false);
    }

    setDefaultProvider(provider as TTSProviderType);
    const voices = defaultVoices[provider as TTSProviderType] || [];
    if (voices.length > 0) {
      setSelectedVoice(voices[0].id);
    }
  };

  const toggleShowKey = (key: string) => {
    setShowKeys((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const providers = [
    {
      id: 'openAi',
      name: 'OpenAI',
      description: 'High-quality tts-1-hd model with natural voices',
      key: openAiKey,
      setKey: setOpenAiKey,
      placeholder: 'sk-...',
    },
    {
      id: 'gemini',
      name: 'Google Gemini',
      description: 'Gemini 2.5 TTS with natural, expressive voices',
      key: geminiKey,
      setKey: setGeminiKey,
      placeholder: 'AIza...',
    },
    {
      id: 'elevenLabs',
      name: 'ElevenLabs',
      description: 'Best-in-class voice quality with word-level timing',
      key: elevenLabsKey,
      setKey: setElevenLabsKey,
      placeholder: 'xi-...',
    },
    {
      id: 'playHt',
      name: 'PlayHT',
      description: 'Wide voice selection with good quality',
      key: playHtKey,
      setKey: setPlayHtKey,
      placeholder: 'api-key...',
      extraField: {
        label: 'User ID',
        value: playHtUser,
        setValue: setPlayHtUser,
        placeholder: 'user-id...',
      },
    },
    {
      id: 'deepgram',
      name: 'Deepgram Aura',
      description: 'Fast and affordable TTS',
      key: deepgramKey,
      setKey: setDeepgramKey,
      placeholder: 'dg-...',
    },
  ];

  return (
    <div
      className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4"
      onClick={(e) => e.target === e.currentTarget && handleClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-modal-title"
    >
      <div ref={dialogRef} tabIndex={-1} className="bg-surface-dark rounded-xl w-full max-w-xl max-h-[90vh] flex flex-col shadow-xl outline-none">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-surface-light">
          <div className="flex items-center gap-3">
            <Key className="w-5 h-5 text-primary" />
            <h2 id="settings-modal-title" className="text-xl font-semibold text-text-primary">Settings</h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close settings"
            className="p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Cloud voices (your own API key)
            </h3>

            {/* Key disclosure: keys are optional and never leave the browser except to their provider */}
            <div className="bg-surface border border-surface-light rounded-lg p-3">
              <div className="flex items-start gap-2">
                <Key className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" aria-hidden="true" />
                <p className="text-xs text-text-secondary">
                  <strong className="text-text-primary">Optional.</strong> Narratoqo works fully without a key, using the
                  free on-device voices below. A key you add stays in this browser tab (session storage, cleared when you
                  close the browser) and is sent only to that provider when you generate audio with it. There is no
                  Narratoqo server that sees it. Cloud providers bill your own account.
                </p>
              </div>
            </div>

            {providers.map((provider) => (
              <div key={provider.id} className="bg-surface rounded-lg p-4">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-medium text-text-primary">{provider.name}</h4>
                    <p className="text-xs text-text-muted">{provider.description}</p>
                  </div>
                  {provider.key && (
                    <span className="px-2 py-0.5 bg-success/20 text-success text-xs rounded">
                      Configured
                    </span>
                  )}
                </div>

                <div className="relative mt-3">
                  <input
                    type={showKeys[provider.id] ? 'text' : 'password'}
                    aria-label={`${provider.name} API key`}
                    autoComplete="off"
                    value={provider.key}
                    onChange={(e) => provider.setKey(e.target.value)}
                    placeholder={provider.placeholder}
                    className="w-full px-3 py-2 pr-10 bg-surface-dark rounded-lg border border-surface-light
                               text-text-primary placeholder-text-muted text-sm
                               focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                  <button
                    type="button"
                    onClick={() => toggleShowKey(provider.id)}
                    aria-label={showKeys[provider.id] ? `Hide ${provider.name} key` : `Show ${provider.name} key`}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text-secondary"
                  >
                    {showKeys[provider.id] ? (
                      <EyeOff className="w-4 h-4" />
                    ) : (
                      <Eye className="w-4 h-4" />
                    )}
                  </button>
                </div>

                {provider.extraField && (
                  <input
                    type="text"
                    value={provider.extraField.value}
                    onChange={(e) => provider.extraField!.setValue(e.target.value)}
                    placeholder={provider.extraField.placeholder}
                    className="w-full mt-2 px-3 py-2 bg-surface-dark rounded-lg border border-surface-light
                               text-text-primary placeholder-text-muted text-sm
                               focus:outline-none focus:ring-2 focus:ring-primary/50"
                  />
                )}
              </div>
            ))}
          </div>

          {/* Default Provider */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide">
              Default TTS Provider
            </h3>
            <select
              aria-label="Default voice provider"
              value={settings.defaultProvider}
              onChange={(e) => handleProviderChange(e.target.value)}
              className="w-full px-3 py-2 bg-surface rounded-lg border border-surface-light
                         text-text-primary text-sm
                         focus:outline-none focus:ring-2 focus:ring-primary/50"
            >
              <optgroup label="Cloud (needs your API key)">
                <option value="openai">OpenAI (tts-1-hd)</option>
                <option value="gemini">Google Gemini 2.5</option>
                <option value="elevenlabs">ElevenLabs</option>
                <option value="playht">PlayHT</option>
                <option value="deepgram">Deepgram Aura</option>
              </optgroup>
              <optgroup label="On-device (free, no key)">
                {webSpeechSupported && <option value="webspeech">Browser Built-in (Web Speech API)</option>}
                {kokoroSupported && <option value="kokoro">Kokoro TTS (High Quality, English)</option>}
                {piperSupported && <option value="piper">Piper TTS (Multi-Language)</option>}
              </optgroup>
            </select>
          </div>

          {/* Browser TTS Section */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <Globe className="w-4 h-4" />
              Browser-Based TTS (Free, Offline-Capable)
            </h3>
            <div className="bg-surface rounded-lg p-4 space-y-3">
              {/* Web Speech API */}
              <div className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                <div>
                  <p className="font-medium text-text-primary text-sm">Browser Built-in</p>
                  <p className="text-xs text-text-muted">Uses system voices, no download needed</p>
                </div>
                {webSpeechSupported ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-success/20 text-success text-xs rounded">
                    <Check className="w-3 h-3" />
                    Available
                  </span>
                ) : (
                  <span className="px-2 py-1 bg-surface-light text-text-muted text-xs rounded">
                    Not Supported
                  </span>
                )}
              </div>

              {/* Kokoro TTS */}
              <div className="flex items-center justify-between py-2 border-b border-surface-light last:border-0">
                <div>
                  <p className="font-medium text-text-primary text-sm">Kokoro TTS (High Quality)</p>
                  <p className="text-xs text-text-muted">One-time download of about 93 MB, then cached. English, best quality.</p>
                </div>
                {!kokoroSupported ? (
                  <span className="px-2 py-1 bg-surface-light text-text-muted text-xs rounded">
                    Not Supported
                  </span>
                ) : kokoroReady ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-success/20 text-success text-xs rounded">
                    <Check className="w-3 h-3" />
                    Ready
                  </span>
                ) : kokoroDownloading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-xs text-text-secondary">{Math.round(downloadProgress)}%</span>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      setKokoroDownloading(true);
                      setDownloadProgress(0);
                      try {
                        // Use the shared provider so playback reuses the loaded model.
                        const kokoro = (getTTSFactory().getProvider('kokoro') as KokoroProvider | undefined) ?? new KokoroProvider();
                        await kokoro.download((progress) => setDownloadProgress(progress));
                        setKokoroReady(true);
                        addToast({ type: 'success', message: 'Kokoro TTS model downloaded!' });
                      } catch {
                        addToast({ type: 'error', message: 'Failed to download Kokoro model' });
                      } finally {
                        setKokoroDownloading(false);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Download
                  </button>
                )}
              </div>

              {/* Piper TTS */}
              <div className="flex items-center justify-between py-2">
                <div>
                  <p className="font-medium text-text-primary text-sm">Piper TTS (Multi-Language)</p>
                  <p className="text-xs text-text-muted">About 63 MB per voice (20 to 115 MB), then cached. 10 languages.</p>
                </div>
                {!piperSupported ? (
                  <span className="px-2 py-1 bg-surface-light text-text-muted text-xs rounded">
                    Not Supported
                  </span>
                ) : piperReady ? (
                  <span className="flex items-center gap-1 px-2 py-1 bg-success/20 text-success text-xs rounded">
                    <Check className="w-3 h-3" />
                    Ready
                  </span>
                ) : piperDownloading ? (
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-primary" />
                    <span className="text-xs text-text-secondary">{Math.round(downloadProgress)}%</span>
                  </div>
                ) : (
                  <button
                    onClick={async () => {
                      setPiperDownloading(true);
                      setDownloadProgress(0);
                      try {
                        const piper = (getTTSFactory().getProvider('piper') as PiperProvider | undefined) ?? new PiperProvider();
                        await piper.download((progress) => setDownloadProgress(progress));
                        // Download default English voice
                        await piper.downloadVoice('en_US-hfc_female-medium', (progress) => setDownloadProgress(progress));
                        setPiperReady(true);
                        addToast({ type: 'success', message: 'Piper TTS ready!' });
                      } catch {
                        addToast({ type: 'error', message: 'Failed to setup Piper TTS' });
                      } finally {
                        setPiperDownloading(false);
                      }
                    }}
                    className="flex items-center gap-1 px-3 py-1 bg-primary/10 hover:bg-primary/20 text-primary text-xs rounded transition-colors"
                  >
                    <Download className="w-3 h-3" />
                    Setup
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-text-muted">
              These voices run on your device: the text you narrate is not sent anywhere, there is no usage cost, and after the first download they work offline.
            </p>
          </div>

          {/* Default Voice with Preview */}
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-text-secondary uppercase tracking-wide flex items-center gap-2">
              <Mic className="w-4 h-4" />
              Default Voice
            </h3>
            <div className="flex gap-2">
              <select
                aria-label="Default voice"
                value={selectedVoice}
                onChange={(e) => setSelectedVoice(e.target.value)}
                className="flex-1 min-w-0 px-3 py-2 bg-surface rounded-lg border border-surface-light
                           text-text-primary text-sm
                           focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                {currentVoices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name}
                  </option>
                ))}
              </select>
              <button
                onClick={handlePreviewVoice}
                disabled={isPreviewLoading || !getCurrentApiKey()}
                className={`shrink-0 flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
                  isPreviewPlaying
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-light text-text-secondary hover:bg-surface-dark disabled:opacity-50 disabled:cursor-not-allowed'
                }`}
                title={isPreviewPlaying ? 'Stop preview' : 'Preview voice'}
              >
                {isPreviewLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : isPreviewPlaying ? (
                  <Pause className="w-4 h-4" />
                ) : (
                  <Volume2 className="w-4 h-4" />
                )}
                <span className="text-sm">
                  {isPreviewLoading ? 'Loading...' : isPreviewPlaying ? 'Stop' : 'Preview'}
                </span>
              </button>
            </div>
            <p className="text-xs text-text-muted">
              Select the default voice for narration. Click "Preview" to hear how the voice sounds.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 p-6 border-t border-surface-light">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-text-secondary hover:text-text-primary transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            className="flex items-center gap-2 px-6 py-2 bg-primary hover:bg-primary-light
                       text-on-primary font-medium rounded-lg transition-colors"
          >
            <Save className="w-4 h-4" />
            Save Settings
          </button>
        </div>
      </div>
    </div>
  );
}
