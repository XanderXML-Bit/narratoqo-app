import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Project, TextChunk } from '@/types';

// Minimal store for testing project slice behavior
describe('Project Slice Logic', () => {
  interface TestProjectState {
    projects: Project[];
    currentProject: Project | null;
    isLoading: boolean;
    setProjects: (projects: Project[]) => void;
    addProject: (project: Project) => void;
    updateProject: (id: string, updates: Partial<Project>) => void;
    removeProject: (id: string) => void;
    setCurrentProject: (project: Project | null) => void;
    updateChunks: (projectId: string, chunks: TextChunk[]) => void;
    updateLastPosition: (projectId: string, chunkIndex: number, time: number) => void;
    setProjectLoading: (isLoading: boolean) => void;
  }

  const makeProject = (overrides: Partial<Project> = {}): Project => ({
    id: 'project-1',
    title: 'Test Project',
    sourceType: 'text',
    originalContent: 'Hello world',
    chunks: [],
    defaultVoiceId: 'alloy',
    defaultProvider: 'openai',
    lastPosition: { chunkIndex: 0, time: 0 },
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });

  let store: ReturnType<typeof createStore<TestProjectState>>;

  beforeEach(() => {
    store = createStore<TestProjectState>((set) => ({
      projects: [],
      currentProject: null,
      isLoading: false,

      setProjects: (projects) => set({ projects }),

      addProject: (project) =>
        set((state) => ({ projects: [project, ...state.projects] })),

      updateProject: (id, updates) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
          ),
          currentProject:
            state.currentProject?.id === id
              ? { ...state.currentProject, ...updates, updatedAt: new Date() }
              : state.currentProject,
        })),

      removeProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((p) => p.id !== id),
          currentProject:
            state.currentProject?.id === id ? null : state.currentProject,
        })),

      setCurrentProject: (project) => set({ currentProject: project }),

      updateChunks: (projectId, chunks) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, chunks, updatedAt: new Date() } : p
          ),
          currentProject:
            state.currentProject?.id === projectId
              ? { ...state.currentProject, chunks, updatedAt: new Date() }
              : state.currentProject,
        })),

      updateLastPosition: (projectId, chunkIndex, time) =>
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId
              ? { ...p, lastPosition: { chunkIndex, time }, updatedAt: new Date() }
              : p
          ),
          currentProject:
            state.currentProject?.id === projectId
              ? {
                  ...state.currentProject,
                  lastPosition: { chunkIndex, time },
                  updatedAt: new Date(),
                }
              : state.currentProject,
        })),

      setProjectLoading: (isLoading) => set({ isLoading }),
    }));
  });

  it('should start with empty state', () => {
    const state = store.getState();
    expect(state.projects).toEqual([]);
    expect(state.currentProject).toBeNull();
    expect(state.isLoading).toBe(false);
  });

  it('should set projects', () => {
    const projects = [makeProject(), makeProject({ id: 'project-2', title: 'Second' })];
    store.getState().setProjects(projects);
    expect(store.getState().projects).toHaveLength(2);
    expect(store.getState().projects[0].title).toBe('Test Project');
  });

  it('should add project to beginning of list', () => {
    store.getState().addProject(makeProject({ id: 'p1', title: 'First' }));
    store.getState().addProject(makeProject({ id: 'p2', title: 'Second' }));

    const projects = store.getState().projects;
    expect(projects).toHaveLength(2);
    expect(projects[0].title).toBe('Second');
    expect(projects[1].title).toBe('First');
  });

  it('should update a project by id', () => {
    store.getState().addProject(makeProject({ id: 'p1', title: 'Original' }));
    store.getState().updateProject('p1', { title: 'Updated' });

    const project = store.getState().projects[0];
    expect(project.title).toBe('Updated');
    expect(project.updatedAt.getTime()).toBeGreaterThan(new Date('2024-01-01').getTime());
  });

  it('should update currentProject when it matches the updated project', () => {
    const project = makeProject({ id: 'p1', title: 'Original' });
    store.getState().addProject(project);
    store.getState().setCurrentProject(project);
    store.getState().updateProject('p1', { title: 'Updated' });

    expect(store.getState().currentProject?.title).toBe('Updated');
  });

  it('should not update currentProject when different project is updated', () => {
    const project1 = makeProject({ id: 'p1', title: 'Current' });
    store.getState().addProject(project1);
    store.getState().addProject(makeProject({ id: 'p2', title: 'Other' }));
    store.getState().setCurrentProject(project1);
    store.getState().updateProject('p2', { title: 'Updated Other' });

    expect(store.getState().currentProject?.title).toBe('Current');
  });

  it('should remove a project by id', () => {
    store.getState().addProject(makeProject({ id: 'p1' }));
    store.getState().addProject(makeProject({ id: 'p2' }));
    store.getState().removeProject('p1');

    expect(store.getState().projects).toHaveLength(1);
    expect(store.getState().projects[0].id).toBe('p2');
  });

  it('should clear currentProject when removing the current project', () => {
    const project = makeProject({ id: 'p1' });
    store.getState().addProject(project);
    store.getState().setCurrentProject(project);
    store.getState().removeProject('p1');

    expect(store.getState().currentProject).toBeNull();
  });

  it('should keep currentProject when removing a different project', () => {
    const project1 = makeProject({ id: 'p1' });
    store.getState().addProject(project1);
    store.getState().addProject(makeProject({ id: 'p2' }));
    store.getState().setCurrentProject(project1);
    store.getState().removeProject('p2');

    expect(store.getState().currentProject?.id).toBe('p1');
  });

  it('should set and clear currentProject', () => {
    const project = makeProject();
    store.getState().setCurrentProject(project);
    expect(store.getState().currentProject).toEqual(project);

    store.getState().setCurrentProject(null);
    expect(store.getState().currentProject).toBeNull();
  });

  it('should update chunks for a project', () => {
    const project = makeProject({ id: 'p1' });
    store.getState().addProject(project);
    store.getState().setCurrentProject(project);

    const chunks: TextChunk[] = [
      { id: 'c1', index: 0, text: 'Hello', type: 'narration', startOffset: 0, endOffset: 5 },
      { id: 'c2', index: 1, text: 'World', type: 'dialogue', startOffset: 6, endOffset: 11 },
    ];
    store.getState().updateChunks('p1', chunks);

    expect(store.getState().projects[0].chunks).toHaveLength(2);
    expect(store.getState().currentProject?.chunks).toHaveLength(2);
  });

  it('should update last position for a project', () => {
    const project = makeProject({ id: 'p1' });
    store.getState().addProject(project);
    store.getState().setCurrentProject(project);

    store.getState().updateLastPosition('p1', 3, 45.5);

    expect(store.getState().projects[0].lastPosition).toEqual({ chunkIndex: 3, time: 45.5 });
    expect(store.getState().currentProject?.lastPosition).toEqual({ chunkIndex: 3, time: 45.5 });
  });

  it('should set loading state', () => {
    store.getState().setProjectLoading(true);
    expect(store.getState().isLoading).toBe(true);

    store.getState().setProjectLoading(false);
    expect(store.getState().isLoading).toBe(false);
  });

  it('should not modify other projects when updating one', () => {
    store.getState().addProject(makeProject({ id: 'p1', title: 'One' }));
    store.getState().addProject(makeProject({ id: 'p2', title: 'Two' }));

    store.getState().updateProject('p1', { title: 'Updated One' });

    const projects = store.getState().projects;
    expect(projects.find((p) => p.id === 'p1')?.title).toBe('Updated One');
    expect(projects.find((p) => p.id === 'p2')?.title).toBe('Two');
  });
});
