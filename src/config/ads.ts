/**
 * AdMob Configuration for Narratoqo
 *
 * Contains all ad unit IDs for iOS and Android platforms.
 * Narratoqo uses interstitial ads shown periodically during audiobook playback.
 *
 * SETUP REQUIRED:
 * 1. Create an AdMob account at https://admob.google.com
 * 2. Create an app for iOS and Android
 * 3. Create interstitial ad units for each platform
 * 4. Replace the placeholder IDs below with your actual IDs
 * 5. Update AndroidManifest.xml with your Android App ID
 * 6. Update iOS Info.plist with your iOS App ID
 */

import { Capacitor } from '@capacitor/core';

// App IDs - REPLACE WITH YOUR ACTUAL APP IDs FROM ADMOB
export const ADMOB_APP_IDS = {
  android: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX', // TODO: Replace with actual Android App ID
  ios: 'ca-app-pub-XXXXXXXXXXXXXXXX~XXXXXXXXXX',     // TODO: Replace with actual iOS App ID
};

// Production Ad Unit IDs - REPLACE WITH YOUR ACTUAL AD UNIT IDs FROM ADMOB
const AD_UNITS = {
  android: {
    interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX', // TODO: Replace with actual interstitial ad unit ID
  },
  ios: {
    interstitial: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX', // TODO: Replace with actual interstitial ad unit ID
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

// Use test ads in development mode
// Set to false and update production IDs before release
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
