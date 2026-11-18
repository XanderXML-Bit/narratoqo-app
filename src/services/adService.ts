/**
 * Ad Service for Narratoqo
 *
 * Manages AdMob interstitial ads for the mobile app.
 * Ads are shown periodically during audiobook listening sessions.
 *
 * Architecture:
 * - Uses dynamic imports to prevent web build crashes
 * - Interstitial ads shown after N chapters/segments
 * - Respects cooldown period between ads
 * - No ads for premium users
 *
 * Usage:
 * - Call initializeAds() once in App.tsx on startup
 * - Call maybeShowInterstitial() after chapter completion
 */

import { Capacitor } from '@capacitor/core';
import { getAdUnitId, isAdSupported, isUsingTestAds } from '@/config/ads';

// ============================================================================
// DYNAMIC IMPORT - Prevents web build crashes
// ============================================================================

interface AdMobPlugin {
  initialize(options: { initializeForTesting: boolean }): Promise<unknown>;
  requestTrackingAuthorization(): Promise<unknown>;
  prepareInterstitial(options: { adId: string; isTesting: boolean }): Promise<unknown>;
  showInterstitial(): Promise<unknown>;
  addListener(eventName: string, callback: () => void): { remove(): void };
}

let AdMob: AdMobPlugin | null = null;

// Promise that resolves when AdMob module is loaded
let admobModuleLoaded: Promise<boolean>;

if (Capacitor.isNativePlatform()) {
  admobModuleLoaded = import('@capacitor-community/admob')
    .then((module) => {
      AdMob = module.AdMob as unknown as AdMobPlugin;
      return true;
    })
    .catch((err) => {
      console.warn('[Ads] AdMob plugin not available:', err);
      return false;
    });
} else {
  admobModuleLoaded = Promise.resolve(false);
}

// ============================================================================
// CONFIGURATION
// ============================================================================

// Show an interstitial after every N chapters
const CHAPTERS_BETWEEN_ADS = 3;

// Minimum time between ads (5 minutes for audiobook listening)
const INTERSTITIAL_COOLDOWN_MS = 5 * 60 * 1000;

// ============================================================================
// STATE TRACKING
// ============================================================================

let adsInitialized = false;
let initializationPromise: Promise<boolean> | null = null;
let chaptersSinceLastAd = 0;
let lastAdShownAt = 0;
let isPremiumUser = false;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize the AdMob SDK. Call once on app startup.
 * Returns true if initialization was successful.
 */
export async function initializeAds(): Promise<boolean> {
  // Return existing initialization if in progress
  if (initializationPromise) return initializationPromise;

  // Already initialized
  if (adsInitialized) return true;

  initializationPromise = (async () => {
    // Wait for module to load
    const moduleLoaded = await admobModuleLoaded;
    if (!moduleLoaded || !AdMob) {
      if (import.meta.env.DEV) console.log('[Ads] Not supported on this platform');
      return false;
    }

    try {
      // Initialize AdMob SDK
      await AdMob.initialize({
        initializeForTesting: isUsingTestAds(),
      });

      if (import.meta.env.DEV) {
        console.log('[Ads] AdMob initialized');
        if (isUsingTestAds()) {
          console.log('[Ads] Using TEST ad units');
        }
      }

      adsInitialized = true;

      // Request tracking authorization (iOS 14+)
      try {
        await AdMob.requestTrackingAuthorization();
      } catch {
        // Expected to fail on Android
      }

      return true;
    } catch (error) {
      console.error('[Ads] Initialization failed:', error);
      return false;
    }
  })();

  return initializationPromise;
}

/**
 * Check if ads are initialized and available
 */
export function isAdsAvailable(): boolean {
  return adsInitialized && isAdSupported() && !isPremiumUser;
}

// ============================================================================
// PREMIUM STATUS
// ============================================================================

/**
 * Set premium user status (premium users don't see ads)
 */
export function setPremiumStatus(premium: boolean): void {
  isPremiumUser = premium;
  if (import.meta.env.DEV) {
    console.log(`[Ads] Premium status: ${premium}`);
  }
}

/**
 * Check if user is premium
 */
export function isPremium(): boolean {
  return isPremiumUser;
}

// ============================================================================
// INTERSTITIAL AD MANAGEMENT
// ============================================================================

/**
 * Call this after the user completes a chapter.
 * Will show an interstitial if conditions are met:
 * - Not a premium user
 * - Enough chapters since last ad
 * - Enough time since last ad
 */
export async function maybeShowInterstitial(): Promise<boolean> {
  // Premium users don't see ads
  if (isPremiumUser) return false;

  // Not on native platform
  if (!isAdSupported()) return false;

  // AdMob not initialized
  if (!AdMob || !adsInitialized) return false;

  // Increment chapter counter
  chaptersSinceLastAd++;

  // Check if we should show an ad
  const now = Date.now();
  const timeSinceLastAd = now - lastAdShownAt;
  const shouldShow =
    chaptersSinceLastAd >= CHAPTERS_BETWEEN_ADS &&
    timeSinceLastAd >= INTERSTITIAL_COOLDOWN_MS;

  if (!shouldShow) {
    if (import.meta.env.DEV) {
      console.log(
        `[Ads] Skip interstitial: ${chaptersSinceLastAd}/${CHAPTERS_BETWEEN_ADS} chapters, ${Math.round(timeSinceLastAd / 1000)}s cooldown`
      );
    }
    return false;
  }

  return showInterstitial();
}

/**
 * Force show an interstitial ad (ignores chapter count and cooldown)
 */
export async function showInterstitial(): Promise<boolean> {
  // Premium users don't see ads
  if (isPremiumUser) return false;

  // Not on native platform
  if (!isAdSupported()) {
    if (import.meta.env.DEV) console.log('[Ads] Interstitial: Not on native platform');
    return true; // On web, simulate success
  }

  // AdMob not initialized
  if (!AdMob || !adsInitialized) {
    if (import.meta.env.DEV) console.log('[Ads] Interstitial: Not initialized');
    return false;
  }

  // Capture in local const so TypeScript narrows the type inside closures
  const adMob = AdMob;

  try {
    // Prepare the interstitial
    await adMob.prepareInterstitial({
      adId: getAdUnitId('interstitial'),
      isTesting: isUsingTestAds(),
    });

    // Set up listeners for ad events
    const dismissPromise = new Promise<boolean>((resolve) => {
      // Listen for ad dismissed event
      const dismissListener = adMob.addListener('onInterstitialAdDismissed', () => {
        dismissListener.remove();
        resolve(true);
      });

      // Listen for ad failed to show
      const failListener = adMob.addListener('onInterstitialAdFailedToShow', () => {
        failListener.remove();
        resolve(false);
      });

      // Timeout after 60 seconds (in case events don't fire)
      setTimeout(() => {
        dismissListener.remove();
        failListener.remove();
        resolve(true); // Assume completed
      }, 60000);
    });

    // Show the interstitial
    await adMob.showInterstitial();

    // Wait for dismissal
    const completed = await dismissPromise;

    if (completed) {
      // Reset counters
      chaptersSinceLastAd = 0;
      lastAdShownAt = Date.now();
      if (import.meta.env.DEV) console.log('[Ads] Interstitial completed');
    } else {
      if (import.meta.env.DEV) console.log('[Ads] Interstitial failed');
    }

    return completed;
  } catch (error) {
    console.error('[Ads] Interstitial error:', error);
    return false;
  }
}

/**
 * Preload an interstitial ad for faster display later.
 * Call this proactively when you know the user will need to watch an ad soon.
 */
export async function preloadInterstitial(): Promise<boolean> {
  if (!AdMob || !adsInitialized) return false;
  if (isPremiumUser) return false;

  try {
    await AdMob.prepareInterstitial({
      adId: getAdUnitId('interstitial'),
      isTesting: isUsingTestAds(),
    });
    if (import.meta.env.DEV) console.log('[Ads] Interstitial preloaded');
    return true;
  } catch (error) {
    console.error('[Ads] Failed to preload interstitial:', error);
    return false;
  }
}

/**
 * Reset ad tracking (e.g., when user signs out)
 */
export function resetAdTracking(): void {
  chaptersSinceLastAd = 0;
  lastAdShownAt = 0;
}
