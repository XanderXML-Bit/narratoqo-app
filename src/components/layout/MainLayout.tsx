import type { ReactNode } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Header />
      <main id="main" className="flex-1 overflow-auto">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
