import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { StateInspector } from './StateInspector';

describe('StateInspector', () => {
  let inspector: StateInspector;

  beforeEach(() => {
    inspector = new StateInspector();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('should return empty projects when store is not initialized', () => {
    expect(inspector.getProjects()).toEqual([]);
  });

  it('should return 0 project count when empty', () => {
    expect(inspector.getProjectCount()).toBe(0);
  });

  it('should return null for current project when empty', () => {
    expect(inspector.getCurrentProject()).toBeNull();
  });

  it('should return undefined for non-existent project', () => {
    expect(inspector.getProject('non-existent')).toBeUndefined();
  });

  it('should return empty chunks for non-existent project', () => {
    expect(inspector.getChunks('non-existent')).toEqual([]);
    expect(inspector.getChunkCount('non-existent')).toBe(0);
  });

  it('should return empty player state when no store', () => {
    expect(inspector.getPlayerState()).toEqual({});
  });

  it('should return empty settings when no store', () => {
    expect(inspector.getSettings()).toEqual({});
  });

  it('should return full state structure', () => {
    const state = inspector.getFullState();
    expect(state).toHaveProperty('projects');
    expect(state).toHaveProperty('currentProject');
    expect(state).toHaveProperty('player');
    expect(state).toHaveProperty('settings');
    expect(state.projects).toEqual([]);
    expect(state.currentProject).toBeNull();
  });

  it('should read projects from localStorage', () => {
    const storeData = {
      state: {
        projects: [
          {
            id: 'p1',
            title: 'Test Project',
            chunks: [{ id: 'c1', text: 'Hello', type: 'narrative' }],
          },
        ],
        currentProject: null,
      },
    };
    localStorage.setItem('narratoqo-store', JSON.stringify(storeData));

    const projects = inspector.getProjects();
    expect(projects).toHaveLength(1);
    expect(projects[0].title).toBe('Test Project');

    expect(inspector.getProjectCount()).toBe(1);
    expect(inspector.getProject('p1')).toBeDefined();
    expect(inspector.getProject('p1')?.title).toBe('Test Project');
  });

  it('should read chunks from project in localStorage', () => {
    const storeData = {
      state: {
        projects: [
          {
            id: 'p1',
            title: 'Test',
            chunks: [
              { id: 'c1', text: 'Hello', type: 'narrative' },
              { id: 'c2', text: '"Hi"', type: 'dialogue' },
            ],
          },
        ],
      },
    };
    localStorage.setItem('narratoqo-store', JSON.stringify(storeData));

    expect(inspector.getChunks('p1')).toHaveLength(2);
    expect(inspector.getChunkCount('p1')).toBe(2);
    expect(inspector.getDialogueChunks('p1')).toHaveLength(1);
  });

  it('should read player state from localStorage', () => {
    const storeData = {
      state: {
        projects: [],
        isPlaying: true,
        currentTime: 45.5,
        totalDuration: 120,
        playbackSpeed: 1.5,
        volume: 0.8,
        highlightMode: 'word',
      },
    };
    localStorage.setItem('narratoqo-store', JSON.stringify(storeData));

    const player = inspector.getPlayerState();
    expect(player.isPlaying).toBe(true);
    expect(player.currentTime).toBe(45.5);
    expect(player.totalDuration).toBe(120);
    expect(player.playbackSpeed).toBe(1.5);
    expect(player.volume).toBe(0.8);
    expect(player.highlightMode).toBe('word');
  });

  it('should read settings from localStorage', () => {
    const storeData = {
      state: {
        projects: [],
        defaultProvider: 'openai',
        defaultVoiceId: 'nova',
        theme: 'dark',
        maxCacheSizeMB: 500,
        autoDeleteOldCache: true,
      },
    };
    localStorage.setItem('narratoqo-store', JSON.stringify(storeData));

    const settings = inspector.getSettings();
    expect(settings.defaultProvider).toBe('openai');
    expect(settings.defaultVoiceId).toBe('nova');
    expect(settings.theme).toBe('dark');
    expect(settings.maxCacheSizeMB).toBe(500);
    expect(settings.autoDeleteOldCache).toBe(true);
  });

  it('should handle corrupted localStorage gracefully', () => {
    localStorage.setItem('narratoqo-store', 'invalid-json{{{');

    expect(inspector.getProjects()).toEqual([]);
    expect(inspector.getPlayerState()).toEqual({});
    expect(inspector.getSettings()).toEqual({});
  });

  it('should handle flat store data (without state wrapper)', () => {
    const storeData = {
      projects: [{ id: 'p1', title: 'Flat', chunks: [] }],
    };
    localStorage.setItem('narratoqo-store', JSON.stringify(storeData));

    expect(inspector.getProjects()).toHaveLength(1);
    expect(inspector.getProjects()[0].title).toBe('Flat');
  });
});
