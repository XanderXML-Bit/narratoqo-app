import { Capacitor } from '@capacitor/core';
import type { PluginListenerHandle } from '@capacitor/core';
import { getInterstitialAdId } from '@/config/ads';

const CHAPTERS_BETWEEN_ADS = 3;
const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;
const INTERSTITIAL_TIMEOUT_MS = 60_000;

let adMob: typeof import('@capacitor-community/admob') | undefined;
let initialization: Promise<boolean> | undefined;
let showingInterstitial = false;
let chaptersSinceLastAd = 0;
let lastAdShownAt = 0;
let isPremiumUser = false;

export async function initializeAds(): Promise<boolean> {
  if (!getInterstitialAdId()) return false;
  if (initialization) return initialization;
  if (adMob) return true;

  initialization = (async () => {
    try {
      const plugin = await import('@capacitor-community/admob');
      await plugin.AdMob.initialize({ initializeForTesting: import.meta.env.DEV });

      if (Capacitor.getPlatform() === 'ios') {
        try {
          await plugin.AdMob.requestTrackingAuthorization();
        } catch (error) {
          console.warn('[Ads] Tracking authorization failed:', error);
        }
      }

      adMob = plugin;
      return true;
    } catch (error) {
      console.error('[Ads] Initialization failed:', error);
      return false;
    } finally {
      initialization = undefined;
    }
  })();

  return initialization;
}

export function isAdsAvailable(): boolean {
  return Boolean(adMob && getInterstitialAdId()) && !isPremiumUser;
}

export function setPremiumStatus(premium: boolean): void {
  isPremiumUser = premium;
}

export function isPremium(): boolean {
  return isPremiumUser;
}

export async function maybeShowInterstitial(): Promise<boolean> {
  if (!isAdsAvailable()) return false;

  chaptersSinceLastAd++;
  if (
    chaptersSinceLastAd < CHAPTERS_BETWEEN_ADS ||
    Date.now() - lastAdShownAt < INTERSTITIAL_COOLDOWN_MS
  ) {
    return false;
  }

  return showInterstitial();
}

export async function showInterstitial(): Promise<boolean> {
  const adId = getInterstitialAdId();
  if (!adMob || !adId || isPremiumUser || showingInterstitial) return false;

  const { AdMob, InterstitialAdPluginEvents: events } = adMob;
  showingInterstitial = true;
  const listeners: PluginListenerHandle[] = [];
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    await AdMob.prepareInterstitial({ adId, isTesting: import.meta.env.DEV });

    let complete!: (dismissed: boolean) => void;
    const dismissal = new Promise<boolean>((resolve) => { complete = resolve; });
    listeners.push(await AdMob.addListener(events.Dismissed, () => complete(true)));
    listeners.push(await AdMob.addListener(events.FailedToShow, () => complete(false)));
    timeout = setTimeout(() => complete(false), INTERSTITIAL_TIMEOUT_MS);

    await AdMob.showInterstitial();
    if (!(await dismissal)) return false;

    chaptersSinceLastAd = 0;
    lastAdShownAt = Date.now();
    return true;
  } catch (error) {
    console.error('[Ads] Interstitial failed:', error);
    return false;
  } finally {
    clearTimeout(timeout);
    try {
      await Promise.all(listeners.map((listener) => listener.remove()));
    } catch (error) {
      console.warn('[Ads] Could not remove interstitial listeners:', error);
    } finally {
      showingInterstitial = false;
    }
  }
}

export async function preloadInterstitial(): Promise<boolean> {
  const adId = getInterstitialAdId();
  if (!adMob || !adId || isPremiumUser || showingInterstitial) return false;

  try {
    await adMob.AdMob.prepareInterstitial({ adId, isTesting: import.meta.env.DEV });
    return true;
  } catch (error) {
    console.error('[Ads] Interstitial preload failed:', error);
    return false;
  }
}

export function resetAdTracking(): void {
  chaptersSinceLastAd = 0;
  lastAdShownAt = 0;
}
