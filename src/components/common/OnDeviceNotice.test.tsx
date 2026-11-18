import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { OnDeviceNotice } from './OnDeviceNotice';
import { reportModelProgress, reportModelError, resetModelDownloadState } from '@/services/tts/modelDownload';

let provider = 'kokoro';
let cached = false;
vi.mock('@/stores', () => ({ useSettingsState: () => ({ defaultProvider: provider }) }));
vi.mock('@/services/tts/KokoroProvider', () => ({ KokoroProvider: { isCached: () => Promise.resolve(cached) } }));

describe('OnDeviceNotice', () => {
  beforeEach(() => {
    provider = 'kokoro';
    cached = false;
    resetModelDownloadState();
  });

  it('states the one-time download size before the first play', async () => {
    await act(async () => { render(<OnDeviceNotice />); });
    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/about 93 MB/);
    expect(note.textContent).toMatch(/stays on this device/);
    expect(note.textContent).toMatch(/saved only in this browser/);
  });

  it('says the model is cached when it already is', async () => {
    cached = true;
    await act(async () => { render(<OnDeviceNotice />); });
    expect(screen.getByRole('note').textContent).toMatch(/cached on this device/);
  });

  it('shows byte progress in a live status region while downloading', async () => {
    await act(async () => { render(<OnDeviceNotice />); });
    act(() => reportModelProgress('kokoro', 46_500_000, 93_000_000));
    const status = screen.getByRole('status');
    expect(status.textContent).toMatch(/47 of 93 MB \(50%\)/);
  });

  it('reports a failed download as an alert with a fallback suggestion', async () => {
    await act(async () => { render(<OnDeviceNotice />); });
    act(() => reportModelError('kokoro', 'network'));
    expect(screen.getByRole('alert').textContent).toMatch(/built-in voice/);
  });

  it('discloses that a cloud voice sends text to that provider with the user key', async () => {
    provider = 'elevenlabs';
    await act(async () => { render(<OnDeviceNotice />); });
    const note = screen.getByRole('note');
    expect(note.textContent).toMatch(/sent to ElevenLabs/);
    expect(note.textContent).toMatch(/your own API key/);
  });
});
