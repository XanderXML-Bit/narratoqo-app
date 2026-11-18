import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ImportModal } from './ImportModal';

// Mock react-router-dom
vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

// Mock nanoid
vi.mock('nanoid', () => ({
  nanoid: () => 'test-id-123',
}));

// Mock database
vi.mock('@/db/schema', () => ({
  saveProject: vi.fn().mockResolvedValue(undefined),
}));

// Mock parsers
vi.mock('@/services/parser', () => ({
  parseURL: vi.fn(),
  parseFile: vi.fn(),
  getAcceptString: () => '.txt,.epub,.pdf',
}));

let mockIsImportModalOpen = false;
const mockSetImportModalOpen = vi.fn();
const mockSetImportState = vi.fn();
const mockResetImportState = vi.fn();
const mockAddToast = vi.fn();
const mockAddProject = vi.fn();
const mockSetCurrentProject = vi.fn();

vi.mock('@/stores', () => ({
  useUIState: () => ({
    isImportModalOpen: mockIsImportModalOpen,
    importState: { isImporting: false, progress: 0, error: null },
  }),
  useUIActions: () => ({
    setImportModalOpen: mockSetImportModalOpen,
    setImportState: mockSetImportState,
    resetImportState: mockResetImportState,
    addToast: mockAddToast,
  }),
  useProjectActions: () => ({
    addProject: mockAddProject,
    setCurrentProject: mockSetCurrentProject,
  }),
  useSettingsState: () => ({
    defaultVoiceId: 'alloy',
    defaultProvider: 'openai',
  }),
}));

describe('ImportModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsImportModalOpen = false;
  });

  it('should not render when closed', () => {
    mockIsImportModalOpen = false;
    const { container } = render(<ImportModal />);
    expect(container.innerHTML).toBe('');
  });

  it('should render when open', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    expect(screen.getByText('New Project')).toBeTruthy();
  });

  it('should show import mode tabs', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    expect(screen.getByText('Paste Text')).toBeTruthy();
    expect(screen.getByText('From URL')).toBeTruthy();
    expect(screen.getByText('Upload File')).toBeTruthy();
  });

  it('should show title input', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    const titleInput = screen.getByPlaceholderText('Enter a title for your project...');
    expect(titleInput).toBeTruthy();
  });

  it('should show text area in paste mode', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    const textarea = screen.getByPlaceholderText(/Paste or type your text here/);
    expect(textarea).toBeTruthy();
  });

  it('should close on close button click', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    const closeButton = screen.getByLabelText('Close import dialog');
    fireEvent.click(closeButton);

    expect(mockSetImportModalOpen).toHaveBeenCalledWith(false);
    expect(mockResetImportState).toHaveBeenCalled();
  });

  it('names the URL fetch button and shows proxy failures inline', async () => {
    const { parseURL } = await import('@/services/parser');
    vi.mocked(parseURL).mockRejectedValueOnce(new Error('Could not fetch this page: both public proxies failed.'));
    mockIsImportModalOpen = true;
    render(<ImportModal />);
    fireEvent.click(screen.getByText('From URL'));
    fireEvent.change(screen.getByPlaceholderText('https://example.com/article'), { target: { value: 'https://example.com/a' } });

    fireEvent.click(screen.getByRole('button', { name: 'Fetch article' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('both public proxies failed');
    expect(screen.getByText('Fetch a page to continue.')).toBeTruthy();
  });

  it('titles pasted text from its first line when no title is given', async () => {
    const { saveProject } = await import('@/db/schema');
    mockIsImportModalOpen = true;
    render(<ImportModal />);
    fireEvent.change(screen.getByLabelText('Text Content'), {
      target: { value: "The Lighthouse Keeper's Ledger\n\nThe lamp was lit at dusk." },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create Project' }));
    await vi.waitFor(() => expect(saveProject).toHaveBeenCalled());
    expect(vi.mocked(saveProject).mock.calls[0][0].title).toBe("The Lighthouse Keeper's Ledger");
  });

  it('counts characters without surrounding whitespace', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);
    fireEvent.change(screen.getByLabelText('Text Content'), { target: { value: '   \n  ' } });
    expect(screen.getByText(/^0 \/ 500,000 characters$/)).toBeTruthy();
  });

  it('closes on Escape', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(mockSetImportModalOpen).toHaveBeenCalledWith(false);
  });

  it('should switch to URL mode', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    fireEvent.click(screen.getByText('From URL'));

    expect(screen.getByPlaceholderText('https://example.com/article')).toBeTruthy();
  });

  it('discloses that URL imports go through a public CORS proxy', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    fireEvent.click(screen.getByText('From URL'));

    const note = screen.getByTestId('url-proxy-disclosure');
    expect(note.textContent).toMatch(/public CORS proxy/);
    expect(note.textContent).toMatch(/allorigins\.win/);
    expect(note.textContent).toMatch(/corsproxy\.io/);
    expect(note.textContent).toMatch(/never leave this device/);
  });

  it('should switch to file upload mode', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    fireEvent.click(screen.getByText('Upload File'));

    expect(screen.getByText(/Drop a file here/)).toBeTruthy();
  });

  it('should have create project button', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    expect(screen.getByText('Create Project')).toBeTruthy();
  });

  it('should be a dialog with correct role', () => {
    mockIsImportModalOpen = true;
    render(<ImportModal />);

    const dialog = screen.getByRole('dialog');
    expect(dialog).toBeTruthy();
  });
});
