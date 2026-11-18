import { describe, it, expect, vi, beforeEach } from 'vitest';
import { updateMediaSessionState, updateMediaSessionPosition } from './useMediaSession';

describe('updateMediaSessionState', () => {
  beforeEach(() => {
    // Setup mediaSession mock
    Object.defineProperty(navigator, 'mediaSession', {
      value: {
        playbackState: 'none',
        metadata: null,
        setActionHandler: vi.fn(),
        setPositionState: vi.fn(),
      },
      writable: true,
      configurable: true,
    });
  });

  it('sets playbackState to playing', () => {
    updateMediaSessionState('playing');
    expect(navigator.mediaSession.playbackState).toBe('playing');
  });

  it('sets playbackState to paused', () => {
    updateMediaSessionState('paused');
    expect(navigator.mediaSession.playbackState).toBe('paused');
  });

  it('sets playbackState to none', () => {
    updateMediaSessionState('none');
    expect(navigator.mediaSession.playbackState).toBe('none');
  });
});

describe('updateMediaSessionPosition', () => {
  let setPositionStateMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    setPositionStateMock = vi.fn();
    Object.defineProperty(navigator, 'mediaSession', {
      value: {
        playbackState: 'none',
        metadata: null,
        setActionHandler: vi.fn(),
        setPositionState: setPositionStateMock,
      },
      writable: true,
      configurable: true,
    });
  });

  it('calls setPositionState with correct values', () => {
    updateMediaSessionPosition(120, 30, 1.5);
    expect(setPositionStateMock).toHaveBeenCalledWith({
      duration: 120,
      position: 30,
      playbackRate: 1.5,
    });
  });

  it('clamps position to duration', () => {
    updateMediaSessionPosition(60, 90, 1);
    expect(setPositionStateMock).toHaveBeenCalledWith({
      duration: 60,
      position: 60,
      playbackRate: 1,
    });
  });

  it('defaults playbackRate to 1', () => {
    updateMediaSessionPosition(100, 50);
    expect(setPositionStateMock).toHaveBeenCalledWith({
      duration: 100,
      position: 50,
      playbackRate: 1,
    });
  });

  it('does not throw when setPositionState throws', () => {
    setPositionStateMock.mockImplementation(() => {
      throw new Error('Invalid state');
    });
    expect(() => updateMediaSessionPosition(100, 50)).not.toThrow();
  });
});
