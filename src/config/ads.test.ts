import { describe, it, expect, vi } from 'vitest';

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    getPlatform: vi.fn(() => 'web'),
    isNativePlatform: vi.fn(() => false),
  },
}));

import { getAdUnitId, isAdSupported, isUsingTestAds, getAppId, ADMOB_APP_IDS } from './ads';

describe('ads config', () => {
  it('exports expected functions', () => {
    expect(typeof getAdUnitId).toBe('function');
    expect(typeof isAdSupported).toBe('function');
    expect(typeof isUsingTestAds).toBe('function');
    expect(typeof getAppId).toBe('function');
  });

  it('isAdSupported returns false on web', () => {
    expect(isAdSupported()).toBe(false);
  });

  it('isUsingTestAds returns true when placeholder IDs present', () => {
    expect(isUsingTestAds()).toBe(true);
  });

  it('getAdUnitId returns test ad ID on web fallback', () => {
    const id = getAdUnitId('interstitial');
    expect(typeof id).toBe('string');
    expect(id.length).toBeGreaterThan(0);
    // Falls back to android test ad unit
    expect(id).toBe('ca-app-pub-3940256099942544/1033173712');
  });

  it('getAppId returns null on web', () => {
    expect(getAppId()).toBeNull();
  });

  it('ADMOB_APP_IDS has android and ios keys', () => {
    expect(ADMOB_APP_IDS).toHaveProperty('android');
    expect(ADMOB_APP_IDS).toHaveProperty('ios');
  });
});
