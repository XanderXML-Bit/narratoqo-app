import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

const { AdMob } = vi.hoisted(() => ({
  AdMob: {
    initialize: vi.fn(),
    requestTrackingAuthorization: vi.fn(),
    prepareInterstitial: vi.fn(),
    showInterstitial: vi.fn(),
    addListener: vi.fn(),
  },
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: vi.fn() },
}));
vi.mock('@capacitor-community/admob', async (importOriginal) => ({
  ...await importOriginal<typeof import('@capacitor-community/admob')>(),
  AdMob,
}));

const appId = 'ca-app-pub-1234567890123456~1234567890';
const interstitialId = 'ca-app-pub-1234567890123456/0987654321';

beforeEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  for (const platform of ['ANDROID', 'IOS']) {
    vi.stubEnv(`VITE_ADMOB_${platform}_APP_ID`, undefined);
    vi.stubEnv(`VITE_ADMOB_${platform}_INTERSTITIAL_ID`, undefined);
  }
});

afterEach(() => vi.unstubAllEnvs());

describe('adService', () => {
  it.each(['android', 'ios', 'web'])('does not initialize or show ads on unconfigured %s', async (platform) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
    const ads = await import('./adService');

    expect(await ads.initializeAds()).toBe(false);
    expect(ads.isAdsAvailable()).toBe(false);
    expect(await ads.preloadInterstitial()).toBe(false);
    expect(await ads.maybeShowInterstitial()).toBe(false);
    expect(await ads.showInterstitial()).toBe(false);
    expect(AdMob.initialize).not.toHaveBeenCalled();
    expect(AdMob.prepareInterstitial).not.toHaveBeenCalled();
  });

  it.each(['android', 'ios'])('initializes and preloads with configured %s IDs', async (platform) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue(platform);
    vi.stubEnv(`VITE_ADMOB_${platform.toUpperCase()}_APP_ID`, appId);
    vi.stubEnv(`VITE_ADMOB_${platform.toUpperCase()}_INTERSTITIAL_ID`, interstitialId);
    vi.stubEnv('DEV', false);
    const ads = await import('./adService');

    expect(await Promise.all([ads.initializeAds(), ads.initializeAds()])).toEqual([true, true]);
    expect(AdMob.initialize).toHaveBeenCalledExactlyOnceWith({ initializeForTesting: false });
    expect(AdMob.requestTrackingAuthorization).toHaveBeenCalledTimes(platform === 'ios' ? 1 : 0);
    expect(ads.isAdsAvailable()).toBe(true);
    expect(await ads.preloadInterstitial()).toBe(true);
    expect(AdMob.prepareInterstitial).toHaveBeenCalledExactlyOnceWith({ adId: interstitialId, isTesting: false });

    ads.setPremiumStatus(true);
    expect(ads.isPremium()).toBe(true);
    expect(ads.isAdsAvailable()).toBe(false);
    expect(await ads.preloadInterstitial()).toBe(false);
    expect(await ads.maybeShowInterstitial()).toBe(false);
    expect(await ads.showInterstitial()).toBe(false);
  });

  it.each([
    ['interstitialAdDismissed', true],
    ['interstitialAdFailedToShow', false],
  ])('handles %s and removes both listeners', async (event, completed) => {
    vi.mocked(Capacitor.getPlatform).mockReturnValue('android');
    vi.stubEnv('VITE_ADMOB_ANDROID_APP_ID', appId);
    vi.stubEnv('VITE_ADMOB_ANDROID_INTERSTITIAL_ID', interstitialId);
    vi.stubEnv('DEV', true);
    const remove = vi.fn();
    const listeners = new Map<string, () => void>();
    AdMob.addListener.mockImplementation(async (name: string, listener: () => void) => {
      listeners.set(name, listener);
      return { remove };
    });
    AdMob.showInterstitial.mockImplementation(async () => listeners.get(event)?.());
    const ads = await import('./adService');

    expect(await ads.initializeAds()).toBe(true);
    expect(await ads.showInterstitial()).toBe(completed);
    expect(AdMob.prepareInterstitial).toHaveBeenCalledExactlyOnceWith({ adId: interstitialId, isTesting: true });
    expect(remove).toHaveBeenCalledTimes(2);
  });
});
