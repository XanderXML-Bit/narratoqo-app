import { useEffect, useState } from 'react';
import { Cpu, Cloud, AlertTriangle } from 'lucide-react';
import { useSettingsState } from '@/stores';
import { useModelDownload, LOCAL_MODEL_SIZES_MB } from '@/services/tts/modelDownload';
import { KokoroProvider } from '@/services/tts/KokoroProvider';
import { PROVIDER_LABELS, isLocalProvider } from '@/services/tts/providerDefaults';

const MB = 1000 * 1000;

/**
 * Honest status line about where narration runs and where data is stored.
 *
 * - On-device voices: states the one-time model download size *before* the
 *   first play, shows byte progress while downloading, and says when the
 *   model is cached.
 * - Cloud voices: says that text goes to that provider with the user's key.
 */
export function OnDeviceNotice({ className = '' }: { className?: string }) {
  const { defaultProvider } = useSettingsState();
  const download = useModelDownload();
  const [kokoroCached, setKokoroCached] = useState<boolean | null>(null);

  useEffect(() => {
    if (defaultProvider !== 'kokoro') return;
    let cancelled = false;
    KokoroProvider.isCached().then((c) => {
      if (!cancelled) setKokoroCached(c);
    });
    return () => {
      cancelled = true;
    };
  }, [defaultProvider, download.status]);

  const storage = 'Projects and generated audio are saved only in this browser.';
  const base = `rounded-lg border px-4 py-3 text-sm ${className}`;

  if (!isLocalProvider(defaultProvider)) {
    const name = PROVIDER_LABELS[defaultProvider];
    return (
      <div role="note" className={`${base} border-surface-light bg-surface-dark/60 text-text-secondary`}>
        <p className="flex items-start gap-2">
          <Cloud className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="text-text-primary">Cloud voice: {name}.</strong> The text you narrate is sent to {name}{' '}
            with your own API key. The key stays in this browser tab (session storage) and is sent only to {name}. {storage}
          </span>
        </p>
      </div>
    );
  }

  if (defaultProvider === 'webspeech') {
    return (
      <div role="note" className={`${base} border-surface-light bg-surface-dark/60 text-text-secondary`}>
        <p className="flex items-start gap-2">
          <Cpu className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="text-text-primary">Free: your browser&apos;s built-in voice.</strong> No download and no
            account. {storage}
          </span>
        </p>
      </div>
    );
  }

  const model = defaultProvider === 'piper' ? 'piper' : 'kokoro';
  const modelName = model === 'piper' ? 'Piper' : 'Kokoro';
  const sizeMb = LOCAL_MODEL_SIZES_MB[model];

  if (download.model === model && download.status === 'downloading') {
    // Small files (config, tokenizer) report first, so measure against the known model size
    // until the large model file has reported its own total.
    const expected = Math.max(download.total, sizeMb * MB);
    const pct = Math.min(100, Math.round((download.loaded / expected) * 100));
    return (
      <div role="status" aria-live="polite" className={`${base} border-primary/40 bg-primary/10 text-text-primary`}>
        <p>
          Downloading the {modelName} voice model: {Math.round(download.loaded / MB)} of {Math.round(expected / MB)} MB
          ({pct}%). This happens once; your browser keeps it.
        </p>
        <div className="mt-2 h-1.5 rounded-full bg-surface-dark overflow-hidden" aria-hidden="true">
          <div className="h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    );
  }

  if (download.model === model && download.status === 'error') {
    return (
      <div role="alert" className={`${base} border-error/50 bg-error/10 text-text-primary`}>
        <p className="flex items-start gap-2">
          <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0 text-error" aria-hidden="true" />
          <span>
            The {modelName} voice model could not load. Check your connection and press Play again, or choose the
            browser&apos;s built-in voice in Settings.
          </span>
        </p>
      </div>
    );
  }

  const ready = (download.model === model && download.status === 'ready') || (model === 'kokoro' && kokoroCached);
  if (ready) {
    return (
      <div role="note" className={`${base} border-surface-light bg-surface-dark/60 text-text-secondary`}>
        <p className="flex items-start gap-2">
          <Cpu className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
          <span>
            <strong className="text-text-primary">Free, on-device {modelName} voice.</strong> The model is cached on this
            device; your text, projects and audio stay in this browser.
          </span>
        </p>
      </div>
    );
  }
  return (
    <div role="note" className={`${base} border-surface-light bg-surface-dark/60 text-text-secondary`}>
      <p className="flex items-start gap-2">
        <Cpu className="w-4 h-4 mt-0.5 shrink-0 text-primary" aria-hidden="true" />
        <span>
          <strong className="text-text-primary">Free, on-device narration.</strong> The open-source {modelName} voice
          runs in your browser, so the text you narrate stays on this device and there is no account or API key. The
          first play downloads the voice model once (about {sizeMb} MB); after that it loads from your browser&apos;s
          cache. {storage}
        </span>
      </p>
    </div>
  );
}
