import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AppBridge } from './AppBridge';

describe('AppBridge', () => {
  let bridge: AppBridge;

  beforeEach(() => {
    localStorage.clear();
    // Access singleton instance
    bridge = AppBridge.getInstance();
    // Clear recorded actions from previous tests
    bridge.recorder.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('singleton', () => {
    it('should return the same instance', () => {
      const instance1 = AppBridge.getInstance();
      const instance2 = AppBridge.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should have inspector and recorder', () => {
      expect(bridge.inspector).toBeDefined();
      expect(bridge.recorder).toBeDefined();
    });
  });

  describe('navigation', () => {
    it('should start on home page', () => {
      expect(bridge.currentPage).toBe('home');
      expect(bridge.currentProjectId).toBeNull();
    });

    it('should navigate home', () => {
      bridge.navigateToProject('p1');
      const result = bridge.navigateHome();

      expect(result.ok).toBe(true);
      expect(bridge.currentPage).toBe('home');
      expect(bridge.currentProjectId).toBeNull();
    });

    it('should navigate to project', () => {
      const result = bridge.navigateToProject('project-123');

      expect(result.ok).toBe(true);
      expect(bridge.currentPage).toBe('project');
      expect(bridge.currentProjectId).toBe('project-123');
    });

    it('should navigate to settings', () => {
      const result = bridge.navigateToSettings();

      expect(result.ok).toBe(true);
      expect(bridge.currentPage).toBe('settings');
    });

    it('should record navigation actions', () => {
      bridge.navigateHome();
      bridge.navigateToProject('p1');
      bridge.navigateToSettings();

      const history = bridge.getActionHistory();
      expect(history.length).toBeGreaterThanOrEqual(3);
      expect(history.some(a => a.method === 'navigateHome')).toBe(true);
      expect(history.some(a => a.method === 'navigateToProject')).toBe(true);
      expect(history.some(a => a.method === 'navigateToSettings')).toBe(true);
    });
  });

  describe('project CRUD', () => {
    it('should create a project', () => {
      const result = bridge.createProject({
        title: 'Test Book',
        sourceType: 'text',
        content: 'Hello world',
      });

      expect(result.ok).toBe(true);
      expect(result.data).toBeDefined();
      expect(result.data!.title).toBe('Test Book');
      expect(result.data!.sourceType).toBe('text');
      expect(result.data!.originalContent).toBe('Hello world');
      expect(result.data!.id).toBeDefined();
      expect(result.data!.chunks).toEqual([]);
      expect(result.data!.defaultProvider).toBe('webspeech');
    });

    it('should create project with custom provider', () => {
      const result = bridge.createProject({
        title: 'Custom',
        sourceType: 'epub',
        content: 'content',
        defaultProvider: 'openai',
        defaultVoiceId: 'nova',
      });

      expect(result.ok).toBe(true);
      expect(result.data!.defaultProvider).toBe('openai');
      expect(result.data!.defaultVoiceId).toBe('nova');
    });

    it('should update a project (without store)', () => {
      const result = bridge.updateProject('p1', { title: 'Updated' });
      expect(result.ok).toBe(true);
    });

    it('should delete a project', () => {
      bridge.navigateToProject('p1');
      expect(bridge.currentProjectId).toBe('p1');

      const result = bridge.deleteProject('p1');
      expect(result.ok).toBe(true);
      // Should navigate back to home when current project is deleted
      expect(bridge.currentPage).toBe('home');
      expect(bridge.currentProjectId).toBeNull();
    });

    it('should not navigate home when deleting a different project', () => {
      bridge.navigateToProject('p1');
      bridge.deleteProject('p2');

      expect(bridge.currentPage).toBe('project');
      expect(bridge.currentProjectId).toBe('p1');
    });
  });

  describe('chunks', () => {
    it('should update chunks', () => {
      const result = bridge.updateChunks('p1', [
        { id: 'c1', text: 'Hello', type: 'narrative', speaker: '' },
      ]);
      expect(result.ok).toBe(true);
    });
  });

  describe('playback control', () => {
    it('should record play action', () => {
      const result = bridge.play();
      expect(result.ok).toBe(true);

      const history = bridge.getActionHistory();
      expect(history.some(a => a.method === 'play')).toBe(true);
    });

    it('should record pause action', () => {
      const result = bridge.pause();
      expect(result.ok).toBe(true);
    });

    it('should record togglePlay action', () => {
      const result = bridge.togglePlay();
      expect(result.ok).toBe(true);
    });

    it('should record seek action', () => {
      const result = bridge.seek(30.5);
      expect(result.ok).toBe(true);

      const history = bridge.getActionHistory();
      const seekAction = history.find(a => a.method === 'seek');
      expect(seekAction).toBeDefined();
      expect((seekAction!.input as { time: number }).time).toBe(30.5);
    });

    it('should record seekToChunk action', () => {
      const result = bridge.seekToChunk(5);
      expect(result.ok).toBe(true);
    });

    it('should record setSpeed action', () => {
      const result = bridge.setSpeed(1.5);
      expect(result.ok).toBe(true);
    });

    it('should record setVolume action', () => {
      const result = bridge.setVolume(0.8);
      expect(result.ok).toBe(true);
    });

    it('should record setHighlightMode action', () => {
      const result = bridge.setHighlightMode('word');
      expect(result.ok).toBe(true);
    });
  });

  describe('settings', () => {
    it('should update settings (without store)', () => {
      const result = bridge.updateSettings({
        defaultProvider: 'openai',
        theme: 'dark',
      });
      expect(result.ok).toBe(true);
    });
  });

  describe('state access', () => {
    it('should return state with navigation info', () => {
      bridge.navigateToProject('p1');
      const state = bridge.getState();

      expect(state).toHaveProperty('currentPage', 'project');
      expect(state).toHaveProperty('currentProjectId', 'p1');
      expect(state).toHaveProperty('projects');
      expect(state).toHaveProperty('currentProject');
      expect(state).toHaveProperty('player');
      expect(state).toHaveProperty('settings');
    });
  });
});
