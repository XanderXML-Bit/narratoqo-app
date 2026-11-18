import { describe, it, expect, beforeEach } from 'vitest';
import { createStore } from 'zustand/vanilla';
import type { Toast, ImportState } from '@/types';

describe('UI Slice Logic', () => {
  interface TestUIState {
    isSidebarOpen: boolean;
    isSettingsOpen: boolean;
    isImportModalOpen: boolean;
    toasts: Toast[];
    importState: ImportState;
    toggleSidebar: () => void;
    setSidebarOpen: (open: boolean) => void;
    toggleSettings: () => void;
    setSettingsOpen: (open: boolean) => void;
    toggleImportModal: () => void;
    setImportModalOpen: (open: boolean) => void;
    addToast: (toast: Omit<Toast, 'id'>) => void;
    removeToast: (id: string) => void;
    clearToasts: () => void;
    setImportState: (state: Partial<ImportState>) => void;
    resetImportState: () => void;
  }

  const initialImportState: ImportState = {
    isImporting: false,
    progress: 0,
    stage: 'idle',
    error: null,
  };

  let toastIdCounter = 0;
  let store: ReturnType<typeof createStore<TestUIState>>;

  beforeEach(() => {
    toastIdCounter = 0;
    store = createStore<TestUIState>((set) => ({
      isSidebarOpen: true,
      isSettingsOpen: false,
      isImportModalOpen: false,
      toasts: [],
      importState: initialImportState,

      toggleSidebar: () => set((s) => ({ isSidebarOpen: !s.isSidebarOpen })),
      setSidebarOpen: (open) => set({ isSidebarOpen: open }),
      toggleSettings: () => set((s) => ({ isSettingsOpen: !s.isSettingsOpen })),
      setSettingsOpen: (open) => set({ isSettingsOpen: open }),
      toggleImportModal: () => set((s) => ({ isImportModalOpen: !s.isImportModalOpen })),
      setImportModalOpen: (open) => set({ isImportModalOpen: open }),

      addToast: (toast) =>
        set((s) => ({
          toasts: [...s.toasts, { ...toast, id: `toast-${++toastIdCounter}` }],
        })),

      removeToast: (id) =>
        set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),

      clearToasts: () => set({ toasts: [] }),

      setImportState: (state) =>
        set((prev) => ({ importState: { ...prev.importState, ...state } })),

      resetImportState: () => set({ importState: initialImportState }),
    }));
  });

  describe('sidebar', () => {
    it('should start with sidebar open', () => {
      expect(store.getState().isSidebarOpen).toBe(true);
    });

    it('should toggle sidebar', () => {
      store.getState().toggleSidebar();
      expect(store.getState().isSidebarOpen).toBe(false);

      store.getState().toggleSidebar();
      expect(store.getState().isSidebarOpen).toBe(true);
    });

    it('should set sidebar open state directly', () => {
      store.getState().setSidebarOpen(false);
      expect(store.getState().isSidebarOpen).toBe(false);

      store.getState().setSidebarOpen(true);
      expect(store.getState().isSidebarOpen).toBe(true);
    });
  });

  describe('settings modal', () => {
    it('should start with settings closed', () => {
      expect(store.getState().isSettingsOpen).toBe(false);
    });

    it('should toggle settings', () => {
      store.getState().toggleSettings();
      expect(store.getState().isSettingsOpen).toBe(true);

      store.getState().toggleSettings();
      expect(store.getState().isSettingsOpen).toBe(false);
    });

    it('should set settings open state directly', () => {
      store.getState().setSettingsOpen(true);
      expect(store.getState().isSettingsOpen).toBe(true);
    });
  });

  describe('import modal', () => {
    it('should start with import modal closed', () => {
      expect(store.getState().isImportModalOpen).toBe(false);
    });

    it('should toggle import modal', () => {
      store.getState().toggleImportModal();
      expect(store.getState().isImportModalOpen).toBe(true);

      store.getState().toggleImportModal();
      expect(store.getState().isImportModalOpen).toBe(false);
    });

    it('should set import modal open state directly', () => {
      store.getState().setImportModalOpen(true);
      expect(store.getState().isImportModalOpen).toBe(true);
    });
  });

  describe('toasts', () => {
    it('should start with no toasts', () => {
      expect(store.getState().toasts).toEqual([]);
    });

    it('should add a toast with generated id', () => {
      store.getState().addToast({ type: 'success', message: 'Done!' });

      const toasts = store.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Done!');
      expect(toasts[0].type).toBe('success');
      expect(toasts[0].id).toBeDefined();
    });

    it('should add multiple toasts', () => {
      store.getState().addToast({ type: 'success', message: 'Success!' });
      store.getState().addToast({ type: 'error', message: 'Error!' });
      store.getState().addToast({ type: 'info', message: 'Info!' });

      expect(store.getState().toasts).toHaveLength(3);
    });

    it('should remove a toast by id', () => {
      store.getState().addToast({ type: 'success', message: 'First' });
      store.getState().addToast({ type: 'error', message: 'Second' });

      const firstToastId = store.getState().toasts[0].id;
      store.getState().removeToast(firstToastId);

      const toasts = store.getState().toasts;
      expect(toasts).toHaveLength(1);
      expect(toasts[0].message).toBe('Second');
    });

    it('should clear all toasts', () => {
      store.getState().addToast({ type: 'success', message: 'One' });
      store.getState().addToast({ type: 'error', message: 'Two' });

      store.getState().clearToasts();
      expect(store.getState().toasts).toEqual([]);
    });

    it('should preserve toast duration', () => {
      store.getState().addToast({ type: 'info', message: 'Custom', duration: 10000 });
      expect(store.getState().toasts[0].duration).toBe(10000);
    });

    it('should handle removing non-existent toast id gracefully', () => {
      store.getState().addToast({ type: 'info', message: 'Test' });
      store.getState().removeToast('non-existent');
      expect(store.getState().toasts).toHaveLength(1);
    });
  });

  describe('import state', () => {
    it('should start with idle import state', () => {
      const { importState } = store.getState();
      expect(importState.isImporting).toBe(false);
      expect(importState.progress).toBe(0);
      expect(importState.stage).toBe('idle');
      expect(importState.error).toBeNull();
    });

    it('should update import state partially', () => {
      store.getState().setImportState({ isImporting: true, stage: 'parsing' });

      const { importState } = store.getState();
      expect(importState.isImporting).toBe(true);
      expect(importState.stage).toBe('parsing');
      expect(importState.progress).toBe(0); // unchanged
    });

    it('should update import progress', () => {
      store.getState().setImportState({ progress: 50 });
      expect(store.getState().importState.progress).toBe(50);

      store.getState().setImportState({ progress: 100 });
      expect(store.getState().importState.progress).toBe(100);
    });

    it('should set import error', () => {
      store.getState().setImportState({
        stage: 'error',
        error: 'Failed to parse file',
      });

      const { importState } = store.getState();
      expect(importState.stage).toBe('error');
      expect(importState.error).toBe('Failed to parse file');
    });

    it('should reset import state', () => {
      store.getState().setImportState({
        isImporting: true,
        progress: 75,
        stage: 'detecting-characters',
      });

      store.getState().resetImportState();

      const { importState } = store.getState();
      expect(importState.isImporting).toBe(false);
      expect(importState.progress).toBe(0);
      expect(importState.stage).toBe('idle');
      expect(importState.error).toBeNull();
    });

    it('should handle full import lifecycle', () => {
      // Start import
      store.getState().setImportState({ isImporting: true, stage: 'parsing' });
      expect(store.getState().importState.stage).toBe('parsing');

      // Update progress
      store.getState().setImportState({ progress: 30 });
      store.getState().setImportState({ progress: 60, stage: 'detecting-characters' });

      // Complete
      store.getState().setImportState({ progress: 100, stage: 'done', isImporting: false });

      const { importState } = store.getState();
      expect(importState.stage).toBe('done');
      expect(importState.progress).toBe(100);
      expect(importState.isImporting).toBe(false);
    });
  });
});
