import { BrowserTTSProvider } from './BrowserTTSProvider';
import type { TTSOptions, TTSResult, Voice, WordTiming } from '@/types';
import { estimateWordTiming } from '../audio/TimingEstimator';

/**
 * Web Speech API TTS Provider.
 *
 * Uses the browser's built-in SpeechSynthesis API to generate speech.
 * Works offline, zero cost, and uses system voices.
 *
 * Key implementation details:
 * - Web Speech API speaks directly - we can't get an audio blob from it
 * - Instead, we use SpeechSynthesis to speak and return timing data
 * - For playback, the audio player will use SpeechSynthesis directly
 * - Word timing comes from boundary events (when available)
 *
 * Browser compatibility notes:
 * - Chrome: voices load asynchronously via voiceschanged event
 * - Safari: limited voices, boundary events unreliable
 * - Firefox: good support, decent voice selection
 */
export class WebSpeechProvider extends BrowserTTSProvider {
  readonly providerType = 'webspeech' as const;
  readonly providerName = 'Browser (Built-in)';
  readonly supportsWordTiming = true; // Via boundary events
  readonly maxChunkLength = 32000; // SpeechSynthesis limit
  readonly supportsStreaming = false;

  private voicesLoaded = false;
  private cachedVoices: SpeechSynthesisVoice[] = [];

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  async isReady(): Promise<boolean> {
    return this.isSupported();
  }

  async download(): Promise<void> {
    // No download needed for Web Speech API
  }

  getDownloadSize(): number {
    return 0;
  }

  async getVoices(): Promise<Voice[]> {
    if (!this.isSupported()) return [];

    const voices = await this.loadVoicesWithTimeout();
    return voices.map((v) => ({
      id: v.voiceURI,
      name: v.name,
      provider: 'webspeech' as const,
      language: v.lang,
      gender: this.inferGender(v.name),
    }));
  }

  /**
   * Synthesize speech using Web Speech API.
   *
   * NOTE: Web Speech API doesn't provide an audio blob - it speaks directly.
   * This method generates a silent audio blob for compatibility with the
   * existing audio pipeline, while the actual playback uses SpeechSynthesis.
   *
   * For real audio output, use synthesizeWithPlayback() which returns
   * a promise that resolves when speech completes.
   */
  async synthesize(options: TTSOptions): Promise<TTSResult> {
    if (!this.isSupported()) {
      throw new Error('Web Speech API not supported');
    }

    const voices = await this.loadVoicesWithTimeout();
    const voice = voices.find((v) => v.voiceURI === options.voiceId) || voices[0];

    if (!voice) {
      throw new Error('No voices available');
    }

    // Synthesize and capture timing from boundary events
    const { duration, timing } = await this.synthesizeWithTiming(
      options.text,
      voice,
      options.speed ?? 1.0
    );

    // Create a silent audio blob for compatibility
    // The actual playback will use SpeechSynthesis directly
    const audioBlob = await this.createSilentAudioBlob(duration);
    const audioUrl = this.createAudioUrl(audioBlob);

    return {
      audioBlob,
      audioUrl,
      duration,
      timing,
    };
  }

  /**
   * Synthesize speech and capture word timing from boundary events.
   */
  private async synthesizeWithTiming(
    text: string,
    voice: SpeechSynthesisVoice,
    speed: number
  ): Promise<{ duration: number; timing: WordTiming[] }> {
    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.rate = speed;

      const timing: WordTiming[] = [];
      let startTimestamp = 0;

      // Capture boundary events for word timing
      utterance.onboundary = (event) => {
        if (event.name === 'word') {
          const charIndex = event.charIndex;
          const charLength =
            event.charLength ?? this.findWordLength(text, charIndex);

          timing.push({
            word: text.substring(charIndex, charIndex + charLength),
            startTime: event.elapsedTime / 1000, // Convert ms to seconds
            endTime: (event.elapsedTime + 200) / 1000, // Estimated end
            charStart: charIndex,
            charEnd: charIndex + charLength,
          });
        }
      };

      utterance.onstart = () => {
        startTimestamp = performance.now();
      };

      utterance.onend = () => {
        const duration = (performance.now() - startTimestamp) / 1000;

        // If no boundary events fired, estimate timing
        const finalTiming =
          timing.length > 0 ? this.refineTiming(timing, duration) : estimateWordTiming(text, duration);

        resolve({ duration, timing: finalTiming });
      };

      utterance.onerror = (event) => {
        reject(new Error(`Speech synthesis failed: ${event.error}`));
      };

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Refine timing data from boundary events.
   * Fixes end times based on next word's start time.
   */
  private refineTiming(timing: WordTiming[], duration: number): WordTiming[] {
    for (let i = 0; i < timing.length - 1; i++) {
      timing[i].endTime = timing[i + 1].startTime;
    }
    // Last word ends at total duration
    if (timing.length > 0) {
      timing[timing.length - 1].endTime = duration;
    }
    return timing;
  }

  /**
   * Create a silent audio blob for the given duration.
   * This is a placeholder for the actual speech audio.
   */
  private async createSilentAudioBlob(duration: number): Promise<Blob> {
    // Create a silent WAV file
    const sampleRate = 16000;
    const numSamples = Math.ceil(sampleRate * duration);
    const buffer = new ArrayBuffer(44 + numSamples * 2);
    const view = new DataView(buffer);

    // Write WAV header
    this.writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + numSamples * 2, true);
    this.writeString(view, 8, 'WAVE');
    this.writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true); // Subchunk1Size
    view.setUint16(20, 1, true); // AudioFormat (PCM)
    view.setUint16(22, 1, true); // NumChannels
    view.setUint32(24, sampleRate, true); // SampleRate
    view.setUint32(28, sampleRate * 2, true); // ByteRate
    view.setUint16(32, 2, true); // BlockAlign
    view.setUint16(34, 16, true); // BitsPerSample
    this.writeString(view, 36, 'data');
    view.setUint32(40, numSamples * 2, true);

    // Data is already zero-initialized (silence)

    return new Blob([buffer], { type: 'audio/wav' });
  }

  private writeString(view: DataView, offset: number, string: string): void {
    for (let i = 0; i < string.length; i++) {
      view.setUint8(offset + i, string.charCodeAt(i));
    }
  }

  /**
   * Play text using Web Speech API directly.
   * Use this for actual playback instead of the audio blob.
   */
  async speak(
    text: string,
    voiceId: string,
    options?: { speed?: number; onBoundary?: (event: SpeechSynthesisEvent) => void }
  ): Promise<void> {
    if (!this.isSupported()) {
      throw new Error('Web Speech API not supported');
    }

    const voices = await this.loadVoicesWithTimeout();
    const voice = voices.find((v) => v.voiceURI === voiceId) || voices[0];

    return new Promise((resolve, reject) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.voice = voice;
      utterance.rate = options?.speed ?? 1.0;

      if (options?.onBoundary) {
        utterance.onboundary = options.onBoundary;
      }

      utterance.onend = () => resolve();
      utterance.onerror = (e) => reject(new Error(`Speech failed: ${e.error}`));

      window.speechSynthesis.speak(utterance);
    });
  }

  /**
   * Stop any ongoing speech.
   */
  stop(): void {
    if (this.isSupported()) {
      window.speechSynthesis.cancel();
    }
  }

  /**
   * Pause ongoing speech.
   */
  pause(): void {
    if (this.isSupported()) {
      window.speechSynthesis.pause();
    }
  }

  /**
   * Resume paused speech.
   */
  resume(): void {
    if (this.isSupported()) {
      window.speechSynthesis.resume();
    }
  }

  /**
   * Load voices with timeout fallback.
   * Chrome loads voices asynchronously, so we need to wait.
   */
  private async loadVoicesWithTimeout(timeout = 5000): Promise<SpeechSynthesisVoice[]> {
    if (this.voicesLoaded) return this.cachedVoices;

    let voices = window.speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.cachedVoices = voices;
      this.voicesLoaded = true;
      return voices;
    }

    // Wait for voices to load
    return new Promise((resolve) => {
      let resolved = false;
      const voicesChanged = () => {
        if (resolved) return;
        resolved = true;
        clearTimeout(fallbackTimer);
        voices = window.speechSynthesis.getVoices();
        this.cachedVoices = voices;
        this.voicesLoaded = true;
        resolve(voices);
      };

      window.speechSynthesis.addEventListener('voiceschanged', voicesChanged, {
        once: true,
      });

      // Fallback timeout — clears event listener if it hasn't fired yet
      const fallbackTimer = setTimeout(() => {
        if (resolved) return;
        resolved = true;
        window.speechSynthesis.removeEventListener('voiceschanged', voicesChanged);
        resolve(window.speechSynthesis.getVoices());
      }, timeout);
    });
  }

  /**
   * Find the length of a word at the given character index.
   */
  private findWordLength(text: string, startIndex: number): number {
    const remaining = text.substring(startIndex);
    const match = remaining.match(/^\S+/);
    return match ? match[0].length : 0;
  }

  /**
   * Infer gender from voice name.
   * This is a heuristic based on common naming patterns.
   */
  private inferGender(name: string): 'male' | 'female' | 'neutral' {
    const lower = name.toLowerCase();
    if (
      lower.includes('female') ||
      lower.includes('woman') ||
      lower.includes('girl') ||
      lower.includes('fiona') ||
      lower.includes('samantha') ||
      lower.includes('karen') ||
      lower.includes('moira') ||
      lower.includes('tessa') ||
      lower.includes('victoria')
    ) {
      return 'female';
    }
    if (
      lower.includes('male') ||
      lower.includes('man') ||
      lower.includes('boy') ||
      lower.includes('daniel') ||
      lower.includes('alex') ||
      lower.includes('fred') ||
      lower.includes('oliver') ||
      lower.includes('thomas')
    ) {
      return 'male';
    }
    return 'neutral';
  }
}
