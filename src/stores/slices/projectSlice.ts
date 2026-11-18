import type { StateCreator } from 'zustand';
import type { StoreState } from '../index';
import type { Project, TextChunk } from '@/types';

export interface ProjectState {
  projects: Project[];
  currentProject: Project | null;
  isLoading: boolean;
}

export interface ProjectActions {
  setProjects: (projects: Project[]) => void;
  addProject: (project: Project) => void;
  updateProject: (id: string, updates: Partial<Project>) => void;
  removeProject: (id: string) => void;
  setCurrentProject: (project: Project | null) => void;
  updateChunks: (projectId: string, chunks: TextChunk[]) => void;
  updateLastPosition: (
    projectId: string,
    chunkIndex: number,
    time: number
  ) => void;
  setProjectLoading: (isLoading: boolean) => void;
}

export type ProjectSlice = ProjectState & ProjectActions;

const initialProjectState: ProjectState = {
  projects: [],
  currentProject: null,
  isLoading: false,
};

export const createProjectSlice: StateCreator<
  StoreState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  ProjectSlice
> = (set) => ({
  ...initialProjectState,

  setProjects: (projects) =>
    set({ projects }, false, 'project/setProjects'),

  addProject: (project) =>
    set(
      (state) => ({ projects: [project, ...state.projects] }),
      false,
      'project/addProject'
    ),

  updateProject: (id, updates) =>
    set(
      (state) => ({
        projects: state.projects.map((p) =>
          p.id === id ? { ...p, ...updates, updatedAt: new Date() } : p
        ),
        currentProject:
          state.currentProject?.id === id
            ? { ...state.currentProject, ...updates, updatedAt: new Date() }
            : state.currentProject,
      }),
      false,
      'project/updateProject'
    ),

  removeProject: (id) =>
    set(
      (state) => ({
        projects: state.projects.filter((p) => p.id !== id),
        currentProject:
          state.currentProject?.id === id ? null : state.currentProject,
      }),
      false,
      'project/removeProject'
    ),

  setCurrentProject: (project) =>
    set({ currentProject: project }, false, 'project/setCurrentProject'),

  updateChunks: (projectId, chunks) =>
    set(
      (state) => ({
        projects: state.projects.map((p) =>
          p.id === projectId ? { ...p, chunks, updatedAt: new Date() } : p
        ),
        currentProject:
          state.currentProject?.id === projectId
            ? { ...state.currentProject, chunks, updatedAt: new Date() }
            : state.currentProject,
      }),
      false,
      'project/updateChunks'
    ),

  updateLastPosition: (projectId, chunkIndex, time) =>
    set(
      (state) => ({
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
      }),
      false,
      'project/updateLastPosition'
    ),

  setProjectLoading: (isLoading) =>
    set({ isLoading }, false, 'project/setLoading'),
});
