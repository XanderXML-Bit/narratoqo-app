import type { ReactNode } from 'react';
import { Header } from './Header';
import { SiteFooter } from './SiteFooter';
import { OfflineBanner } from '@/components/common/OfflineBanner';

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  return (
    <div className="flex flex-col min-h-screen bg-surface">
      <Header />
      <OfflineBanner />
      <main id="main" className="flex-1 overflow-auto">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}
