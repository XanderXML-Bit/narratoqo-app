import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SettingsModal } from './SettingsModal';

// Mock TTS providers with proper classes
vi.mock('@/services/tts', () => {
  class MockWebSpeechProvider {
    isSupported() { return true; }
  }
  class MockKokoroProvider {
    static VOICES: unknown[] = [];
    static isCached() { return Promise.resolve(false); }
    isSupported() { return false; }
    isReady() { return Promise.resolve(false); }
  }
  class MockPiperProvider {
    static VOICES: unknown[] = [];
    isSupported() { return true; }
    isReady() { return Promise.resolve(false); }
  }
  return {
    getTTSFactory: vi.fn(() => ({
      getProvider: vi.fn(),
    })),
    WebSpeechProvider: MockWebSpeechProvider,
    KokoroProvider: MockKokoroProvider,
    PiperProvider: MockPiperProvider,
  };
});

let mockIsSettingsOpen = false;
const mockSetSettingsOpen = vi.fn();
const mockAddToast = vi.fn();
const mockSetApiKey = vi.fn();
const mockSetPlayHtUserId = vi.fn();
const mockSetDefaultProvider = vi.fn();
const mockSetDefaultVoice = vi.fn();

vi.mock('@/stores', () => ({
  useUIState: () => ({ isSettingsOpen: mockIsSettingsOpen }),
  useUIActions: () => ({
    setSettingsOpen: mockSetSettingsOpen,
    addToast: mockAddToast,
  }),
  useSettingsState: () => ({
    defaultProvider: 'openai',
    defaultVoiceId: 'alloy',
    openAiApiKey: '',
    geminiApiKey: '',
    elevenLabsApiKey: '',
    playHtApiKey: '',
    playHtUserId: '',
    deepgramApiKey: '',
  }),
  useSettingsActions: () => ({
    setApiKey: mockSetApiKey,
    setPlayHtUserId: mockSetPlayHtUserId,
    setDefaultProvider: mockSetDefaultProvider,
    setDefaultVoice: mockSetDefaultVoice,
  }),
}));

describe('SettingsModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsSettingsOpen = false;
  });

  it('should not render when closed', async () => {
    mockIsSettingsOpen = false;
    let container: HTMLElement;
    await act(async () => {
      ({ container } = render(<SettingsModal />));
    });
    expect(container!.innerHTML).toBe('');
  });

  it('closes on Escape', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' });
    expect(mockSetSettingsOpen).toHaveBeenCalledWith(false);
  });

  it('moves focus into the dialog and keeps Tab inside it', async () => {
    mockIsSettingsOpen = true;
    const opener = document.createElement('button');
    document.body.appendChild(opener);
    opener.focus();
    await act(async () => { render(<SettingsModal />); });
    await act(async () => { await new Promise((r) => requestAnimationFrame(() => r(undefined))); });
    const dialog = screen.getByRole('dialog');
    expect(dialog.contains(document.activeElement)).toBe(true);

    const buttons = [...dialog.querySelectorAll<HTMLButtonElement>('button:not([disabled])')];
    buttons[buttons.length - 1].focus();
    fireEvent.keyDown(document.activeElement!, { key: 'Tab' });
    expect(document.activeElement).toBe(buttons[0]);
    fireEvent.keyDown(document.activeElement!, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(buttons[buttons.length - 1]);
    opener.remove();
  });

  it('should render when open', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getByText('Settings')).toBeTruthy();
  });

  it('should show provider API key sections', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getAllByText('OpenAI').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Google Gemini/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('ElevenLabs').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('PlayHT').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Deepgram/).length).toBeGreaterThanOrEqual(1);
  });

  it('should show security notice', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getByText(/Narratoqo works fully without a key/)).toBeTruthy();
    expect(screen.getByText(/sent only to that provider/)).toBeTruthy();
  });

  it('should have close button', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    const closeButton = screen.getByLabelText('Close settings');
    expect(closeButton).toBeTruthy();

    fireEvent.click(closeButton);
    expect(mockSetSettingsOpen).toHaveBeenCalledWith(false);
  });

  it('should have save button that saves settings', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    const saveButton = screen.getByText('Save Settings');
    expect(saveButton).toBeTruthy();

    fireEvent.click(saveButton);
    expect(mockSetApiKey).toHaveBeenCalled();
    expect(mockAddToast).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: 'Settings saved!' })
    );
  });

  it('should have Cancel button', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    const cancelButton = screen.getByText('Cancel');
    expect(cancelButton).toBeTruthy();

    fireEvent.click(cancelButton);
    expect(mockSetSettingsOpen).toHaveBeenCalledWith(false);
  });

  it('should have default TTS provider selector', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getByText('Default TTS Provider')).toBeTruthy();
  });

  it('should show browser-based TTS section', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getByText(/Browser-Based TTS/)).toBeTruthy();
    expect(screen.getByText('Browser Built-in')).toBeTruthy();
  });

  it('should show voice preview section', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    expect(screen.getByText('Default Voice')).toBeTruthy();
    expect(screen.getByText('Preview')).toBeTruthy();
  });

  it('should be a dialog with correct role', async () => {
    mockIsSettingsOpen = true;
    await act(async () => { render(<SettingsModal />); });

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
  });
});
