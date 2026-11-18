/**
 * Wiring tests for the reader page (review findings on PR #7):
 * - opening Full Audio Mode suspends the segment reader before the full player mounts,
 *   and closing it hands control back;
 * - the "preparing audio" live region exists on the phone layout as well as the desktop one.
 * The hooks are faked here; their own behaviour is covered in src/hooks/*.test.ts.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  isMobile: false,
  isPreparing: true,
  setSuspended: vi.fn(),
  events: [] as string[],
}));

vi.mock('@/stores', () => {
  const project = { id: 'p', title: 'Sample', chunks: [], originalContent: 'One. Two.' };
  return {
    useProjectState: () => ({ currentProject: project }),
    usePlayerState: () => ({ isPlaying: false, currentTime: 0, totalDuration: 0, volume: 1, playbackSpeed: 1 }),
    usePlayerActions: () => ({}),
    useSettingsState: () => ({ defaultProvider: 'kokoro', defaultVoiceId: 'af_heart' }),
    useUIActions: () => ({ addToast: vi.fn(), setSettingsOpen: vi.fn() }),
  };
});

vi.mock('@/hooks', () => ({
  useDeviceDetection: () => ({ isMobile: mocks.isMobile }),
  useMediaSession: () => {},
  updateMediaSessionState: () => {},
  updateMediaSessionPosition: () => {},
}));

vi.mock('@/services/audio', () => ({ getAudioPlayer: () => ({ seek: vi.fn(), pause: vi.fn() }) }));

vi.mock('@/hooks/useProjectLoader', () => ({
  useProjectLoader: () => ({
    segments: [
      { index: 0, text: 'One.', startOffset: 0, endOffset: 4 },
      { index: 1, text: 'Two.', startOffset: 5, endOffset: 9 },
    ],
    pages: [],
    initialAudioStatus: {},
  }),
}));

vi.mock('@/hooks/useAudioGeneration', () => ({
  useAudioGeneration: () => ({
    generateSegmentAudio: vi.fn(),
    preloadNextSegments: vi.fn(),
    cancelPreloads: vi.fn(),
    segmentAudioStatus: {},
    generatingSegmentIndex: null,
  }),
}));

vi.mock('@/hooks/useSegmentPlayback', () => ({
  SEEK_STEP_SECONDS: 10,
  useSegmentPlayback: () => {
    const noop = vi.fn();
    return {
      currentSegmentIndex: 1,
      currentWordIndex: -1,
      currentTiming: undefined,
      autoRead: true,
      isPreparing: mocks.isPreparing,
      preparingSegmentIndex: mocks.isPreparing ? 1 : null,
      handleSegmentClick: noop,
      handlePlayPause: noop,
      handleAutoReadToggle: noop,
      handleSeekBackward: noop,
      handleSeekForward: noop,
      handleWordClick: noop,
      handlePrevSegment: noop,
      handleNextSegment: noop,
      handleVolumeChange: noop,
      handleMuteToggle: noop,
      handleSpeedChange: noop,
      handleSeek: noop,
      setSuspended: (v: boolean) => {
        mocks.events.push(`suspend:${v}`);
        mocks.setSuspended(v);
      },
    };
  },
}));

vi.mock('@/components/layout/ResponsiveProjectHeader', () => ({
  ResponsiveProjectHeader: ({ onFullAudioMode }: { onFullAudioMode: () => void }) => (
    <button onClick={onFullAudioMode}>Full Audio Mode</button>
  ),
}));

vi.mock('@/components/FullAudioView', async () => {
  const { useEffect } = await import('react');
  return {
    FullAudioView: ({ onClose }: { onClose: () => void }) => {
      useEffect(() => { mocks.events.push('full-audio-mounted'); }, []);
      return <button onClick={onClose}>Back to reader</button>;
    },
  };
});

vi.mock('@/components/export', () => ({ ExportModal: () => null }));
vi.mock('@/components/common/OnDeviceNotice', () => ({ OnDeviceNotice: () => null }));
vi.mock('@/components/layout/SiteFooter', () => ({ SiteFooter: () => null }));
vi.mock('@/components/text/HighlightedText', () => ({
  HighlightedText: ({ text }: { text: string }) => <span>{text}</span>,
  ContinuousHighlightedText: () => null,
}));

import { Project } from './Project';

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/project/p']}>
      <Routes>
        <Route path="/project/:id" element={<Project />} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  mocks.isMobile = false;
  mocks.isPreparing = true;
  mocks.setSuspended.mockClear();
  mocks.events.length = 0;
  Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => cleanup());

describe('Project page', () => {
  it.each([
    ['desktop', false],
    ['phone', true],
  ])('announces the preparing state on the %s layout', (_name, isMobile) => {
    mocks.isMobile = isMobile;
    renderPage();
    const status = screen.getByTestId('preparing-status');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-live', 'polite');
    expect(status).toHaveTextContent('Preparing audio for segment 2 of 2');
  });

  it('suspends the reader before Full Audio Mode mounts, and hands control back on close', async () => {
    renderPage();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Full Audio Mode' })); });
    expect(mocks.events).toEqual(['suspend:true', 'full-audio-mounted']);

    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Back to reader' })); });
    expect(mocks.setSuspended).toHaveBeenLastCalledWith(false);
    expect(screen.getByRole('button', { name: 'Full Audio Mode' })).toBeInTheDocument();
  });
});
