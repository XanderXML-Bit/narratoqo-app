import type { StateCreator } from 'zustand';
import type { StoreState } from '../index';
import type { Toast, ImportState } from '@/types';
import { nanoid } from 'nanoid';

export interface UIState {
  isSidebarOpen: boolean;
  isSettingsOpen: boolean;
  isImportModalOpen: boolean;
  toasts: Toast[];
  importState: ImportState;
}

export interface UIActions {
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

export type UISlice = UIState & UIActions;

const initialImportState: ImportState = {
  isImporting: false,
  progress: 0,
  stage: 'idle',
  error: null,
};

const initialUIState: UIState = {
  isSidebarOpen: true,
  isSettingsOpen: false,
  isImportModalOpen: false,
  toasts: [],
  importState: initialImportState,
};

export const createUISlice: StateCreator<
  StoreState,
  [['zustand/devtools', never], ['zustand/persist', unknown]],
  [],
  UISlice
> = (set) => ({
  ...initialUIState,

  toggleSidebar: () =>
    set(
      (state) => ({ isSidebarOpen: !state.isSidebarOpen }),
      false,
      'ui/toggleSidebar'
    ),

  setSidebarOpen: (open) =>
    set({ isSidebarOpen: open }, false, 'ui/setSidebarOpen'),

  toggleSettings: () =>
    set(
      (state) => ({ isSettingsOpen: !state.isSettingsOpen }),
      false,
      'ui/toggleSettings'
    ),

  setSettingsOpen: (open) =>
    set({ isSettingsOpen: open }, false, 'ui/setSettingsOpen'),

  toggleImportModal: () =>
    set(
      (state) => ({ isImportModalOpen: !state.isImportModalOpen }),
      false,
      'ui/toggleImportModal'
    ),

  setImportModalOpen: (open) =>
    set({ isImportModalOpen: open }, false, 'ui/setImportModalOpen'),

  addToast: (toast) =>
    set(
      (state) => ({
        toasts: [...state.toasts, { ...toast, id: nanoid() }],
      }),
      false,
      'ui/addToast'
    ),

  removeToast: (id) =>
    set(
      (state) => ({
        toasts: state.toasts.filter((t) => t.id !== id),
      }),
      false,
      'ui/removeToast'
    ),

  clearToasts: () => set({ toasts: [] }, false, 'ui/clearToasts'),

  setImportState: (state) =>
    set(
      (prev) => ({
        importState: { ...prev.importState, ...state },
      }),
      false,
      'ui/setImportState'
    ),

  resetImportState: () =>
    set({ importState: initialImportState }, false, 'ui/resetImportState'),
});
