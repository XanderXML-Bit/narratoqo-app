import { memo } from 'react';
import { WifiOff } from 'lucide-react';
import { useOnlineStatus } from '@/hooks';

/**
 * Banner shown when the app is offline.
 * Cloud TTS providers require internet, so this is important feedback.
 */
export const OfflineBanner = memo(function OfflineBanner() {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div role="alert" className="fixed top-0 left-0 right-0 z-50 bg-amber-700 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
      <WifiOff className="w-4 h-4" />
      <span>You're offline. Cloud voices are unavailable.</span>
    </div>
  );
});
