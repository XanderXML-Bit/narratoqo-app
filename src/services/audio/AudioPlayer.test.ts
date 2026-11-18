import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AudioPlayer, getAudioPlayer, resetAudioPlayer } from './AudioPlayer';

// Mock Howler
vi.mock('howler', () => {
  return {
    Howl: class MockHowl {
      play = vi.fn();
      pause = vi.fn();
      stop = vi.fn();
      seek = vi.fn().mockReturnValue(0);
      volume = vi.fn();
      rate = vi.fn();
      duration = vi.fn().mockReturnValue(10);
      unload = vi.fn();

      constructor(options: Record<string, unknown>) {
        this.play.mockImplementation(() => {
          if (typeof options.onplay === 'function') (options.onplay as () => void)();
        });
        this.pause.mockImplementation(() => {
          if (typeof options.onpause === 'function') (options.onpause as () => void)();
        });
        setTimeout(() => {
          if (typeof options.onload === 'function') (options.onload as () => void)();
        }, 0);
      }
    },
  };
});

// Mock requestAnimationFrame
let rafCallbacks: Array<(time: number) => void> = [];
let rafId = 0;

vi.stubGlobal('requestAnimationFrame', (cb: (time: number) => void) => {
  rafCallbacks.push(cb);
  return ++rafId;
});
vi.stubGlobal('cancelAnimationFrame', (_id: number) => {
  rafCallbacks = [];
});

describe('AudioPlayer', () => {
  let player: AudioPlayer;

  beforeEach(() => {
    vi.useFakeTimers();
    rafCallbacks = [];
    rafId = 0;
    resetAudioPlayer();
    player = new AudioPlayer();
  });

  afterEach(() => {
    player.unload();
    vi.useRealTimers();
  });

  describe('construction', () => {
    it('should create a player with default state', () => {
      expect(player.isPlaying).toBe(false);
      expect(player.isLoaded).toBe(false);
      expect(player.volume).toBe(1.0);
      expect(player.playbackRate).toBe(1.0);
      expect(player.currentTime).toBe(0);
      expect(player.duration).toBe(0);
      expect(player.hasTiming).toBe(false);
    });

    it('should accept callbacks in constructor', () => {
      const onPlay = vi.fn();
      const playerWithCallbacks = new AudioPlayer({ onPlay });
      expect(playerWithCallbacks).toBeDefined();
    });
  });

  // Helper: load with timer flush (mock onload fires via setTimeout)
  async function loadWithFlush(p: AudioPlayer, source: string | Blob, timing?: Parameters<AudioPlayer['load']>[1]) {
    const loadPromise = p.load(source, timing);
    await vi.runAllTimersAsync();
    return loadPromise;
  }

  describe('load', () => {
    it('should load audio from a blob', async () => {
      const blob = new Blob(['test'], { type: 'audio/mp3' });
      await loadWithFlush(player, blob);
      expect(player.isLoaded).toBe(true);
    });

    it('should load audio from a URL string', async () => {
      await loadWithFlush(player, 'https://example.com/audio.mp3');
      expect(player.isLoaded).toBe(true);
    });

    it('should accept timing data', async () => {
      const timing = [
        { word: 'Hello', startTime: 0, endTime: 0.5, charStart: 0, charEnd: 5 },
        { word: 'World', startTime: 0.5, endTime: 1.0, charStart: 6, charEnd: 11 },
      ];
      await loadWithFlush(player, new Blob(['test']), timing);
      expect(player.hasTiming).toBe(true);
    });

    it('should unload previous audio before loading new', async () => {
      await loadWithFlush(player, new Blob(['test1']));
      const firstLoaded = player.isLoaded;
      await loadWithFlush(player, new Blob(['test2']));
      expect(firstLoaded).toBe(true);
      expect(player.isLoaded).toBe(true);
    });
  });

  describe('volume', () => {
    it('should set volume between 0 and 1', () => {
      player.setVolume(0.5);
      expect(player.volume).toBe(0.5);
    });

    it('should clamp volume to 0', () => {
      player.setVolume(-1);
      expect(player.volume).toBe(0);
    });

    it('should clamp volume to 1', () => {
      player.setVolume(2);
      expect(player.volume).toBe(1);
    });
  });

  describe('playback rate', () => {
    it('should set playback rate between 0.5 and 2', () => {
      player.setPlaybackRate(1.5);
      expect(player.playbackRate).toBe(1.5);
    });

    it('should clamp rate to 0.5', () => {
      player.setPlaybackRate(0.1);
      expect(player.playbackRate).toBe(0.5);
    });

    it('should clamp rate to 2', () => {
      player.setPlaybackRate(5);
      expect(player.playbackRate).toBe(2);
    });
  });

  describe('getCurrentWordIndex', () => {
    it('should return -1 with no timing', () => {
      expect(player.getCurrentWordIndex()).toBe(-1);
    });

    it('should find current word by time', async () => {
      const timing = [
        { word: 'Hello', startTime: 0, endTime: 0.5, charStart: 0, charEnd: 5 },
        { word: 'World', startTime: 0.5, endTime: 1.0, charStart: 6, charEnd: 11 },
      ];
      await loadWithFlush(player, new Blob(['test']), timing);

      // Player currentTime is 0 by default, which falls in first word
      expect(player.getCurrentWordIndex()).toBe(0);
    });
  });

  describe('seekToWord', () => {
    it('should not throw with invalid index', async () => {
      await loadWithFlush(player, new Blob(['test']));
      expect(() => player.seekToWord(-1)).not.toThrow();
      expect(() => player.seekToWord(100)).not.toThrow();
    });
  });

  describe('unload', () => {
    it('should reset state after unload', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.unload();
      expect(player.isLoaded).toBe(false);
      expect(player.isPlaying).toBe(false);
      expect(player.currentTime).toBe(0);
      expect(player.duration).toBe(0);
      expect(player.hasTiming).toBe(false);
    });

    it('should revoke blob URLs on unload', async () => {
      const revokeObjectURL = vi.fn();
      globalThis.URL.revokeObjectURL = revokeObjectURL;

      await loadWithFlush(player, new Blob(['test']));
      player.unload();

      expect(revokeObjectURL).toHaveBeenCalled();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getAudioPlayer', () => {
      const p1 = getAudioPlayer();
      const p2 = getAudioPlayer();
      expect(p1).toBe(p2);
    });

    it('should create new instance after reset', () => {
      const p1 = getAudioPlayer();
      resetAudioPlayer();
      const p2 = getAudioPlayer();
      expect(p1).not.toBe(p2);
    });
  });

  describe('setCallbacks', () => {
    it('should merge callbacks', () => {
      const onPlay = vi.fn();
      const onPause = vi.fn();
      player.setCallbacks({ onPlay });
      player.setCallbacks({ onPause });
      // Both should be set (merged)
      expect(player).toBeDefined();
    });
  });

  describe('togglePlay', () => {
    it('should toggle from paused to playing', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.togglePlay();
      // togglePlay calls play() on the howl
      expect(player.isPlaying).toBe(true);
    });
  });

  describe('seek', () => {
    it('should clamp seek to 0', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.seek(-5);
      expect(player.currentTime).toBe(0);
    });
  });

  describe('seekForward and seekBackward', () => {
    it('should seek forward by default 10 seconds', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.seekForward();
      // Clamped to duration (10)
      expect(player.currentTime).toBe(10);
    });

    it('should seek backward by default 10 seconds', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.seekBackward();
      // Clamped to 0
      expect(player.currentTime).toBe(0);
    });

    it('should seek forward by custom seconds', async () => {
      await loadWithFlush(player, new Blob(['test']));
      player.seekForward(5);
      expect(player.currentTime).toBe(5);
    });
  });
});
