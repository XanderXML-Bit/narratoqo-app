import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { Home } from './Home';

// Mock react-router-dom
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock database operations
vi.mock('@/db/schema', () => ({
  getAllProjects: vi.fn().mockResolvedValue([]),
  deleteProject: vi.fn().mockResolvedValue(undefined),
  saveProject: vi.fn().mockResolvedValue(undefined),
}));

// The on-device notice reads browser caches; it has its own tests.
vi.mock('@/components/common/OnDeviceNotice', () => ({
  OnDeviceNotice: () => null,
}));

// Store mock state
let mockProjects: Array<{
  id: string;
  title: string;
  originalContent: string;
  chunks: Array<{ id: string }>;
  lastPosition: { chunkIndex: number; time: number };
  createdAt: Date;
  updatedAt: Date;
  sourceType: string;
}> = [];
let mockIsLoading = false;
const mockSetProjects = vi.fn();
const mockAddProject = vi.fn();
const mockRemoveProject = vi.fn();
const mockSetCurrentProject = vi.fn();
const mockSetProjectLoading = vi.fn();
const mockSetImportModalOpen = vi.fn();
const mockAddToast = vi.fn();

vi.mock('@/stores', () => ({
  useProjectState: () => ({
    projects: mockProjects,
    isLoading: mockIsLoading,
  }),
  useProjectActions: () => ({
    setProjects: mockSetProjects,
    addProject: mockAddProject,
    removeProject: mockRemoveProject,
    setCurrentProject: mockSetCurrentProject,
    setProjectLoading: mockSetProjectLoading,
  }),
  useUIActions: () => ({
    setImportModalOpen: mockSetImportModalOpen,
    addToast: mockAddToast,
  }),
  useSettingsState: () => ({ defaultProvider: 'kokoro', defaultVoiceId: 'af_heart' }),
}));

describe('Home', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockProjects = [];
    mockIsLoading = false;
  });

  it('renders the page frame, not a spinner, while projects load', () => {
    render(<Home />);

    // The heading and a reserved list area paint first, so nothing moves when the read finishes.
    expect(screen.getByText('Your projects')).toBeTruthy();
    expect(document.querySelector('.animate-spin')).toBeNull();
    const reserved = document.querySelector('[aria-hidden="true"].invisible');
    expect(reserved?.textContent).toContain('Hear it before you import anything');
    expect(screen.queryByRole('button', { name: /Use your own text/ })).toBeNull();
  });

  it('should render empty state when no projects', async () => {
    render(<Home />);
    await screen.findByText('Create your first narration project');

    expect(screen.getByText('Hear it before you import anything')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Play the sample chapter/ })).toBeTruthy();
  });

  it('should render "Your projects" heading', () => {
    render(<Home />);

    expect(screen.getByText('Your projects')).toBeTruthy();
  });

  it('should show project count', () => {
    mockProjects = [
      {
        id: 'p1',
        title: 'Book 1',
        originalContent: 'Hello world content goes here',
        chunks: [{ id: 'c1' }],
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceType: 'text',
      },
      {
        id: 'p2',
        title: 'Book 2',
        originalContent: 'Another project',
        chunks: [],
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceType: 'text',
      },
    ];

    render(<Home />);

    expect(screen.getByText('2 projects')).toBeTruthy();
  });

  it('should render project cards', () => {
    mockProjects = [
      {
        id: 'p1',
        title: 'My Audiobook',
        originalContent: 'This is the preview text of my audiobook.',
        chunks: [{ id: 'c1' }, { id: 'c2' }],
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceType: 'text',
      },
    ];

    render(<Home />);

    expect(screen.getByText('My Audiobook')).toBeTruthy();
    // The card counts reader segments (one paragraph here), not parser chunks.
    expect(screen.getByText('1 segment')).toBeTruthy();
    expect(screen.queryByText(/chunks/)).toBeNull();
    expect(screen.getByText(/This is the preview text/)).toBeTruthy();
  });

  it('keeps Play and Delete visible without hover', () => {
    mockProjects = [{
      id: 'p1', title: 'My Audiobook', originalContent: 'One.\n\nTwo.', chunks: [],
      lastPosition: { chunkIndex: 0, time: 0 }, createdAt: new Date(), updatedAt: new Date(), sourceType: 'text',
    }];
    render(<Home />);
    for (const name of ['Play My Audiobook', 'Delete My Audiobook']) {
      const button = screen.getByRole('button', { name });
      expect(button.className).not.toMatch(/opacity-0/);
    }
    expect(screen.getByText('2 segments')).toBeTruthy();
  });

  it('confirms delete inside the card instead of window.confirm', async () => {
    const { deleteProject } = await import('@/db/schema');
    const confirmSpy = vi.spyOn(window, 'confirm');
    mockProjects = [{
      id: 'p1', title: 'My Audiobook', originalContent: 'Text.', chunks: [],
      lastPosition: { chunkIndex: 0, time: 0 }, createdAt: new Date(), updatedAt: new Date(), sourceType: 'text',
    }];
    render(<Home />);

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Audiobook' }));
    expect(confirmSpy).not.toHaveBeenCalled();
    // The safe choice takes focus, so Enter twice cannot delete.
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteProject).not.toHaveBeenCalled();
    expect(mockNavigate).not.toHaveBeenCalled();

    // Cancel keeps the project.
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(deleteProject).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Delete My Audiobook' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await vi.waitFor(() => expect(deleteProject).toHaveBeenCalledWith('p1'));
    expect(mockRemoveProject).toHaveBeenCalledWith('p1');
    expect(mockNavigate).not.toHaveBeenCalled();
    confirmSpy.mockRestore();
  });

  it('reopens an existing sample instead of creating a duplicate', async () => {
    const { saveProject } = await import('@/db/schema');
    const { SAMPLE_TEXT, SAMPLE_TITLE } = await import('@/services/sampleProject');
    mockProjects = [{
      id: 'sample-1', title: SAMPLE_TITLE, originalContent: SAMPLE_TEXT, chunks: [],
      lastPosition: { chunkIndex: 0, time: 0 }, createdAt: new Date(), updatedAt: new Date(), sourceType: 'text',
    }];
    render(<Home />);
    fireEvent.click(screen.getByRole('button', { name: /Play the sample chapter/ }));
    expect(saveProject).not.toHaveBeenCalled();
    expect(mockNavigate).toHaveBeenCalledWith('/project/sample-1', { state: { autoplay: true } });
  });

  it('should open import modal from empty state', async () => {
    render(<Home />);

    fireEvent.click(await screen.findByRole('button', { name: /Use your own text/ }));
    expect(mockSetImportModalOpen).toHaveBeenCalledWith(true);
  });

  it('creates the sample project and navigates with autoplay', async () => {
    const { saveProject } = await import('@/db/schema');
    render(<Home />);

    fireEvent.click(await screen.findByRole('button', { name: /Play the sample chapter/ }));

    await vi.waitFor(() => expect(mockNavigate).toHaveBeenCalled());
    expect(saveProject).toHaveBeenCalledTimes(1);
    const saved = vi.mocked(saveProject).mock.calls[0][0];
    expect(saved.title).toMatch(/Alice in Wonderland/);
    expect(saved.defaultProvider).toBe('kokoro');
    expect(saved.defaultVoiceId).toBe('af_heart');
    expect(mockAddProject).toHaveBeenCalledWith(saved);
    expect(mockNavigate).toHaveBeenCalledWith(`/project/${saved.id}`, { state: { autoplay: true } });
  });

  it('ignores the store loading flag, so no spinner replaces the list', async () => {
    mockIsLoading = true;
    render(<Home />);
    expect(document.querySelector('.animate-spin')).toBeNull();
    expect(await screen.findByText('Create your first narration project')).toBeTruthy();
  });

  it('announces loading to assistive tech, then shows the empty state', async () => {
    render(<Home />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading projects');
    expect(await screen.findByText('Create your first narration project')).toBeTruthy();
    expect(screen.getByRole('status')).toHaveTextContent('');
  });

  it('should show singular project count', () => {
    mockProjects = [
      {
        id: 'p1',
        title: 'Solo Book',
        originalContent: 'content',
        chunks: [],
        lastPosition: { chunkIndex: 0, time: 0 },
        createdAt: new Date(),
        updatedAt: new Date(),
        sourceType: 'text',
      },
    ];

    render(<Home />);

    expect(screen.getByText('1 project')).toBeTruthy();
  });

  it('should call setProjectLoading on mount', () => {
    render(<Home />);

    expect(mockSetProjectLoading).toHaveBeenCalledWith(true);
  });
});
