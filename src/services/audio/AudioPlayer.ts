import { Howl } from 'howler';
import type { WordTiming } from '@/types';
import { getBlobURLManager } from './BlobURLManager';

type PlaybackCallback = () => void;
type TimeUpdateCallback = (time: number) => void;
type WordUpdateCallback = (wordIndex: number) => void;

interface AudioPlayerOptions {
  onPlay?: PlaybackCallback;
  onPause?: PlaybackCallback;
  onEnd?: PlaybackCallback;
  onError?: (error: Error) => void;
  onTimeUpdate?: TimeUpdateCallback;
  onWordUpdate?: WordUpdateCallback;
  onLoad?: PlaybackCallback;
  onSeek?: TimeUpdateCallback;
}

/**
 * Audio player service wrapping Howler.js for reliable audio playback.
 */
export class AudioPlayer {
  private howl: Howl | null = null;
  private currentUrl: string | null = null;
  private timing: WordTiming[] = [];
  private callbacks: AudioPlayerOptions = {};

  // Playback state
  private _isPlaying = false;
  private _volume = 1.0;
  private _playbackRate = 1.0;
  private _currentTime = 0;
  private _duration = 0;

  constructor(options?: AudioPlayerOptions) {
    if (options) {
      this.callbacks = options;
    }
  }

  /**
   * Load audio from a URL or Blob.
   */
  async load(source: string | Blob, timing?: WordTiming[]): Promise<void> {
    // Clean up previous audio
    this.unload();

    // Convert Blob to URL if needed
    const url = source instanceof Blob ? getBlobURLManager().create(source, `audio-player-${Date.now()}`) : source;
    this.currentUrl = url;
    this.timing = timing || [];

    return new Promise((resolve, reject) => {
      this.howl = new Howl({
        src: [url],
        format: ['mp3', 'wav', 'ogg'],
        html5: true, // Required for long audio and seeking
        volume: this._volume,
        rate: this._playbackRate,
        onload: () => {
          this._duration = this.howl?.duration() || 0;
          this.callbacks.onLoad?.();
          resolve();
        },
        onloaderror: (_id, error) => {
          const err = new Error(`Failed to load audio: ${error}`);
          this.callbacks.onError?.(err);
          reject(err);
        },
        onplay: () => {
          this._isPlaying = true;
          this.startTimeUpdates();
          this.callbacks.onPlay?.();
        },
        onpause: () => {
          this._isPlaying = false;
          this.stopTimeUpdates();
          this.callbacks.onPause?.();
        },
        onend: () => {
          this._isPlaying = false;
          this.stopTimeUpdates();
          this.callbacks.onEnd?.();
        },
        onseek: () => {
          this._currentTime = this.howl?.seek() as number || 0;
          this.callbacks.onSeek?.(this._currentTime);
          this.updateCurrentWord();
        },
        onplayerror: (_id, error) => {
          this._isPlaying = false;
          this.callbacks.onError?.(new Error(`Playback error: ${error}`));
        },
      });
    });
  }

  /**
   * Start playback.
   */
  play(): void {
    if (this.howl) {
      this.howl.play();
    }
  }

  /**
   * Pause playback.
   */
  pause(): void {
    if (this.howl) {
      this.howl.pause();
    }
  }

  /**
   * Toggle play/pause.
   */
  togglePlay(): void {
    if (this._isPlaying) {
      this.pause();
    } else {
      this.play();
    }
  }

  /**
   * Stop playback and reset position.
   */
  stop(): void {
    if (this.howl) {
      this.howl.stop();
      this._isPlaying = false;
      this._currentTime = 0;
      this.stopTimeUpdates();
    }
  }

  /**
   * Seek to a specific time in seconds.
   */
  seek(time: number): void {
    if (this.howl) {
      const clampedTime = Math.max(0, Math.min(time, this._duration));
      this.howl.seek(clampedTime);
      this._currentTime = clampedTime;
    }
  }

  /**
   * Seek forward by a number of seconds.
   */
  seekForward(seconds: number = 10): void {
    this.seek(this._currentTime + seconds);
  }

  /**
   * Seek backward by a number of seconds.
   */
  seekBackward(seconds: number = 10): void {
    this.seek(this._currentTime - seconds);
  }

  /**
   * Set playback volume (0.0 to 1.0).
   */
  setVolume(volume: number): void {
    this._volume = Math.max(0, Math.min(1, volume));
    if (this.howl) {
      this.howl.volume(this._volume);
    }
  }

  /**
   * Set playback rate (0.5 to 2.0).
   */
  setPlaybackRate(rate: number): void {
    this._playbackRate = Math.max(0.5, Math.min(2, rate));
    if (this.howl) {
      this.howl.rate(this._playbackRate);
    }
  }

  /**
   * Unload current audio and release resources.
   */
  unload(): void {
    this.stopTimeUpdates();

    if (this.howl) {
      this.howl.unload();
      this.howl = null;
    }

    // Revoke object URL if we created one
    if (this.currentUrl?.startsWith('blob:')) {
      getBlobURLManager().revokeByUrl(this.currentUrl);
    }

    this.currentUrl = null;
    this.timing = [];
    this._isPlaying = false;
    this._currentTime = 0;
    this._duration = 0;
  }

  /**
   * Update event callbacks.
   */
  setCallbacks(callbacks: AudioPlayerOptions): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  // Getters for state
  get isPlaying(): boolean {
    return this._isPlaying;
  }

  get isLoaded(): boolean {
    return this.howl !== null;
  }

  get volume(): number {
    return this._volume;
  }

  get playbackRate(): number {
    return this._playbackRate;
  }

  get currentTime(): number {
    return this._currentTime;
  }

  get duration(): number {
    return this._duration;
  }

  get hasTiming(): boolean {
    return this.timing.length > 0;
  }

  /**
   * Get the current word index based on playback time.
   */
  getCurrentWordIndex(): number {
    if (this.timing.length === 0) return -1;

    for (let i = 0; i < this.timing.length; i++) {
      const word = this.timing[i];
      if (this._currentTime >= word.startTime && this._currentTime < word.endTime) {
        return i;
      }
      // Handle the case where we're past the last word
      if (i === this.timing.length - 1 && this._currentTime >= word.startTime) {
        return i;
      }
    }

    // If before first word, return -1
    if (this.timing.length > 0 && this._currentTime < this.timing[0].startTime) {
      return -1;
    }

    return -1;
  }

  /**
   * Seek to a specific word by index.
   */
  seekToWord(wordIndex: number): void {
    if (wordIndex >= 0 && wordIndex < this.timing.length) {
      this.seek(this.timing[wordIndex].startTime);
    }
  }

  private lastWordIndex = -1;
  private lastTimeUpdate = 0;
  private lastWordCheck = 0;
  private rafId: number | null = null;
  private static readonly TIME_UPDATE_THROTTLE = 250; // 4 updates/second for time display
  private static readonly WORD_CHECK_MIN_INTERVAL = 80; // ~12 Hz for word boundary detection

  private startTimeUpdates(): void {
    if (this.rafId) return;

    // Reset tracking state
    this.lastWordIndex = -1;
    this.lastTimeUpdate = 0;
    this.lastWordCheck = 0;

    // Use requestAnimationFrame for display-synced updates
    // Automatically pauses when tab is backgrounded (saves battery on mobile)
    // Adapts to monitor refresh rate (60Hz, 120Hz, etc.)
    const updateLoop = () => {
      if (!this.howl || !this._isPlaying) {
        this.rafId = null;
        return;
      }

      const now = Date.now();
      this._currentTime = (this.howl.seek() as number) || 0;

      // Word boundary detection: throttled to ~12 Hz (every 80ms)
      // Words typically last 100-300ms, so 80ms check catches all transitions
      if (now - this.lastWordCheck >= AudioPlayer.WORD_CHECK_MIN_INTERVAL) {
        this.lastWordCheck = now;
        const currentWordIndex = this.getCurrentWordIndex();
        if (currentWordIndex !== this.lastWordIndex) {
          this.lastWordIndex = currentWordIndex;
          this.callbacks.onWordUpdate?.(currentWordIndex);
        }
      }

      // Time display updates: throttled to 4 Hz (every 250ms)
      if (now - this.lastTimeUpdate >= AudioPlayer.TIME_UPDATE_THROTTLE) {
        this.lastTimeUpdate = now;
        this.callbacks.onTimeUpdate?.(this._currentTime);
      }

      this.rafId = requestAnimationFrame(updateLoop);
    };

    this.rafId = requestAnimationFrame(updateLoop);
  }

  private stopTimeUpdates(): void {
    if (this.rafId) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private updateCurrentWord(): void {
    if (this.timing.length > 0) {
      const wordIndex = this.getCurrentWordIndex();
      // Only update if word actually changed
      if (wordIndex !== this.lastWordIndex) {
        this.lastWordIndex = wordIndex;
        this.callbacks.onWordUpdate?.(wordIndex);
      }
    }
  }
}

// Singleton instance
let playerInstance: AudioPlayer | null = null;

export function getAudioPlayer(options?: AudioPlayerOptions): AudioPlayer {
  if (!playerInstance) {
    playerInstance = new AudioPlayer(options);
  } else if (options) {
    playerInstance.setCallbacks(options);
  }
  return playerInstance;
}

export function resetAudioPlayer(): void {
  if (playerInstance) {
    playerInstance.unload();
    playerInstance = null;
  }
}
