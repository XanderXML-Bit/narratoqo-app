import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock @capacitor/core before import
vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: vi.fn(() => false),
  },
}));

vi.mock('@/config/ads', () => ({
  getAdUnitId: vi.fn(() => 'test-ad-unit-id'),
  isAdSupported: vi.fn(() => false),
  isUsingTestAds: vi.fn(() => true),
}));

describe('adService', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('exports expected functions', async () => {
    const adService = await import('./adService');
    expect(typeof adService.initializeAds).toBe('function');
    expect(typeof adService.isAdsAvailable).toBe('function');
    expect(typeof adService.setPremiumStatus).toBe('function');
    expect(typeof adService.isPremium).toBe('function');
    expect(typeof adService.maybeShowInterstitial).toBe('function');
    expect(typeof adService.showInterstitial).toBe('function');
    expect(typeof adService.preloadInterstitial).toBe('function');
    expect(typeof adService.resetAdTracking).toBe('function');
  });

  it('isAdsAvailable returns false on non-native platform', async () => {
    const { isAdsAvailable } = await import('./adService');
    expect(isAdsAvailable()).toBe(false);
  });

  it('setPremiumStatus and isPremium work', async () => {
    const { setPremiumStatus, isPremium } = await import('./adService');
    expect(isPremium()).toBe(false);
    setPremiumStatus(true);
    expect(isPremium()).toBe(true);
    setPremiumStatus(false);
    expect(isPremium()).toBe(false);
  });

  it('maybeShowInterstitial returns false for premium user', async () => {
    const { setPremiumStatus, maybeShowInterstitial } = await import('./adService');
    setPremiumStatus(true);
    const result = await maybeShowInterstitial();
    expect(result).toBe(false);
  });

  it('maybeShowInterstitial returns false when ads not supported', async () => {
    const { maybeShowInterstitial } = await import('./adService');
    const result = await maybeShowInterstitial();
    expect(result).toBe(false);
  });

  it('showInterstitial returns false for premium user', async () => {
    const { setPremiumStatus, showInterstitial } = await import('./adService');
    setPremiumStatus(true);
    const result = await showInterstitial();
    expect(result).toBe(false);
  });

  it('showInterstitial returns true on web (simulates success)', async () => {
    const { showInterstitial } = await import('./adService');
    // On web, isAdSupported returns false, so it returns true (simulate success)
    const result = await showInterstitial();
    expect(result).toBe(true);
  });

  it('preloadInterstitial returns false when not initialized', async () => {
    const { preloadInterstitial } = await import('./adService');
    const result = await preloadInterstitial();
    expect(result).toBe(false);
  });

  it('initializeAds returns false on non-native platform', async () => {
    const { initializeAds } = await import('./adService');
    const result = await initializeAds();
    expect(result).toBe(false);
  });

  it('initializeAds returns cached result on second call', async () => {
    const { initializeAds } = await import('./adService');
    const result1 = await initializeAds();
    const result2 = await initializeAds();
    expect(result1).toBe(result2);
  });

  it('resetAdTracking does not throw', async () => {
    const { resetAdTracking } = await import('./adService');
    expect(() => resetAdTracking()).not.toThrow();
  });
});
