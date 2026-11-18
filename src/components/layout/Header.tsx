import { Settings, Plus } from 'lucide-react';
import { useUIActions } from '@/stores';

export function Header() {
  const { toggleSettings, toggleImportModal } = useUIActions();

  return (
    <header className="home-header flex items-center justify-between px-6 py-4 border-b border-surface-light bg-surface">
      <div className="home-brand flex items-center gap-3">
        <img src="/favicon.svg" alt="" width="32" height="32" className="w-8 h-8 rounded-lg" />
        <h1 className="font-display text-xl font-semibold text-text-primary">Narratoqo</h1>
      </div>

      <div className="home-actions flex items-center gap-2">
        <button
          onClick={toggleImportModal}
          className="home-new-project flex items-center gap-2 px-4 py-2 text-sm font-medium text-text-primary border border-surface-light hover:border-primary hover:bg-surface-light rounded-lg transition-colors"
          aria-label="Create new project"
        >
          <Plus className="w-4 h-4" />
          New Project
        </button>

        <button
          onClick={toggleSettings}
          className="home-settings p-2 text-text-secondary hover:text-text-primary hover:bg-surface-light rounded-lg transition-colors"
          aria-label="Settings"
        >
          <Settings className="w-5 h-5" />
        </button>
      </div>
    </header>
  );
}
