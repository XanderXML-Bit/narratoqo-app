import { useEffect } from 'react';

interface MediaSessionConfig {
  title: string;
  artist?: string;
  album?: string;
  artwork?: string;
  onPlay?: () => void;
  onPause?: () => void;
  onSeekBackward?: () => void;
  onSeekForward?: () => void;
  onPreviousTrack?: () => void;
  onNextTrack?: () => void;
  onSeekTo?: (time: number) => void;
}

/**
 * Hook to integrate with the Media Session API for lock screen controls
 */
export function useMediaSession(config: MediaSessionConfig | null) {
  // Update metadata
  useEffect(() => {
    if (!config || !('mediaSession' in navigator)) return;

    navigator.mediaSession.metadata = new MediaMetadata({
      title: config.title,
      artist: config.artist || 'Narratoqo',
      album: config.album || 'Text to Speech',
      artwork: config.artwork
        ? [
            { src: config.artwork, sizes: '96x96', type: 'image/png' },
            { src: config.artwork, sizes: '128x128', type: 'image/png' },
            { src: config.artwork, sizes: '192x192', type: 'image/png' },
            { src: config.artwork, sizes: '256x256', type: 'image/png' },
            { src: config.artwork, sizes: '384x384', type: 'image/png' },
            { src: config.artwork, sizes: '512x512', type: 'image/png' },
          ]
        : [],
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.title, config?.artist, config?.album, config?.artwork]);

  // Set up action handlers
  useEffect(() => {
    if (!config || !('mediaSession' in navigator)) return;

    const handlers: Array<[MediaSessionAction, MediaSessionActionHandler | null]> = [
      ['play', config.onPlay || null],
      ['pause', config.onPause || null],
      ['seekbackward', config.onSeekBackward || null],
      ['seekforward', config.onSeekForward || null],
      ['previoustrack', config.onPreviousTrack || null],
      ['nexttrack', config.onNextTrack || null],
    ];

    // Set handlers
    handlers.forEach(([action, handler]) => {
      try {
        navigator.mediaSession.setActionHandler(action, handler);
      } catch (e) {
        console.warn(`Media Session action '${action}' not supported`, e);
      }
    });

    // SeekTo handler
    if (config.onSeekTo) {
      try {
        navigator.mediaSession.setActionHandler('seekto', (details) => {
          if (details.seekTime !== undefined) {
            config.onSeekTo?.(details.seekTime);
          }
        });
      } catch (e) {
        console.warn('Media Session seekto not supported', e);
      }
    }

    // Cleanup
    return () => {
      handlers.forEach(([action]) => {
        try {
          navigator.mediaSession.setActionHandler(action, null);
        } catch {
          // Ignore cleanup errors
        }
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    config?.onPlay,
    config?.onPause,
    config?.onSeekBackward,
    config?.onSeekForward,
    config?.onPreviousTrack,
    config?.onNextTrack,
    config?.onSeekTo,
  ]);
}

/**
 * Update playback state in Media Session
 */
export function updateMediaSessionState(state: 'playing' | 'paused' | 'none') {
  if ('mediaSession' in navigator) {
    navigator.mediaSession.playbackState = state;
  }
}

/**
 * Update playback position in Media Session
 */
export function updateMediaSessionPosition(
  duration: number,
  position: number,
  playbackRate: number = 1
) {
  if ('mediaSession' in navigator) {
    try {
      navigator.mediaSession.setPositionState({
        duration,
        position: Math.min(position, duration),
        playbackRate,
      });
    } catch {
      // Ignore errors from invalid position state
    }
  }
}
