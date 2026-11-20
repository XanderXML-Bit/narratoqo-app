/**
 * AdMob Configuration for Narratoqo
 *
 * Contains all ad unit IDs for iOS and Android platforms.
 * The public snapshot does not call the ad service from the app.
 *
 * Follow-up for the Android and iOS app and interstitial IDs, including the
 * matching native app IDs: https://github.com/XanderXML-Bit/narratoqo-app/issues/2
 */

import { Capacitor } from '@capacitor/core';

// Placeholder app IDs
export const ADMOB_APP_IDS = {
  android: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX',
  ios: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX',
};

// Placeholder production ad unit IDs
const AD_UNITS = {
  android: {
    interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  },
  ios: {
    interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
  },
};

// Google's official test ad unit IDs (use during development)
// These are provided by Google and always serve test ads
const TEST_AD_UNITS = {
  android: {
    interstitial: 'ca-app-pub-3940256099942544/1033173712',
  },
  ios: {
    interstitial: 'ca-app-pub-3940256099942544/4411468910',
  },
};

// Use test ads in development or while the Android app ID is a placeholder.
const USE_TEST_ADS = import.meta.env.DEV || ADMOB_APP_IDS.android.includes('XXXX');

/**
 * Get the appropriate ad unit ID based on platform and ad type
 */
export function getAdUnitId(type: 'interstitial'): string {
  const platform = Capacitor.getPlatform();
  const units = USE_TEST_ADS ? TEST_AD_UNITS : AD_UNITS;

  if (platform === 'android') {
    return units.android[type];
  } else if (platform === 'ios') {
    return units.ios[type];
  }

  // Fallback for web (use test IDs)
  return TEST_AD_UNITS.android[type];
}

/**
 * Check if ads are supported on the current platform
 */
export function isAdSupported(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === 'android' || platform === 'ios';
}

/**
 * Check if using test ads
 */
export function isUsingTestAds(): boolean {
  return USE_TEST_ADS;
}

/**
 * Get the App ID for the current platform
 */
export function getAppId(): string | null {
  const platform = Capacitor.getPlatform();
  if (platform === 'android') return ADMOB_APP_IDS.android;
  if (platform === 'ios') return ADMOB_APP_IDS.ios;
  return null;
}
