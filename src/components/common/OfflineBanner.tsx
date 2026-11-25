import { memo } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

export const OfflineBanner = memo(function OfflineBanner({ className = '' }: { className?: string }) {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div role="alert" className={`shrink-0 bg-amber-700 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium ${className}`}>
      <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
      <span>You're offline. Cloud voices are unavailable.</span>
    </div>
  );
});
