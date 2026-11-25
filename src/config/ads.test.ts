import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Capacitor } from '@capacitor/core';

vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: vi.fn() },
}));

const appId = 'ca-app-pub-1234567890123456~1234567890';
const interstitialId = 'ca-app-pub-1234567890123456/0987654321';

beforeEach(() => {
  for (const platform of ['ANDROID', 'IOS']) {
    vi.stubEnv(`VITE_ADMOB_${platform}_APP_ID`, undefined);
    vi.stubEnv(`VITE_ADMOB_${platform}_INTERSTITIAL_ID`, undefined);
  }
  vi.resetModules();
});

afterEach(() => vi.unstubAllEnvs());

describe.each(['android', 'ios'])('%s ads', (platform) => {
  const prefix = `VITE_ADMOB_${platform.toUpperCase()}`;

  beforeEach(() => vi.mocked(Capacitor.getPlatform).mockReturnValue(platform));

  it.each([
    ['neither ID', undefined, undefined],
    ['only an app ID', appId, undefined],
    ['only an ad unit ID', undefined, interstitialId],
    ['a blank app ID', '   ', interstitialId],
    ['a malformed ad unit ID', appId, appId],
  ])('disables ads with %s', async (_condition, app, interstitial) => {
    vi.stubEnv(`${prefix}_APP_ID`, app);
    vi.stubEnv(`${prefix}_INTERSTITIAL_ID`, interstitial);
    const { getInterstitialAdId } = await import('./ads');
    expect(getInterstitialAdId()).toBeNull();
  });

  it('uses the configured interstitial ID for this platform only', async () => {
    const otherPlatform = platform === 'android' ? 'IOS' : 'ANDROID';
    vi.stubEnv(`VITE_ADMOB_${otherPlatform}_APP_ID`, appId);
    vi.stubEnv(`VITE_ADMOB_${otherPlatform}_INTERSTITIAL_ID`, interstitialId);
    const disabled = await import('./ads');
    expect(disabled.getInterstitialAdId()).toBeNull();

    const configuredId = interstitialId.replace('0987654321', '0123456789');
    vi.stubEnv(`${prefix}_APP_ID`, ` ${appId} `);
    vi.stubEnv(`${prefix}_INTERSTITIAL_ID`, ` ${configuredId} `);
    vi.resetModules();
    const { getInterstitialAdId } = await import('./ads');
    expect(getInterstitialAdId()).toBe(configuredId);
  });
});

it('keeps ads off on web even with all IDs set', async () => {
  vi.mocked(Capacitor.getPlatform).mockReturnValue('web');
  for (const platform of ['ANDROID', 'IOS']) {
    vi.stubEnv(`VITE_ADMOB_${platform}_APP_ID`, appId);
    vi.stubEnv(`VITE_ADMOB_${platform}_INTERSTITIAL_ID`, interstitialId);
  }
  const { getInterstitialAdId } = await import('./ads');
  expect(getInterstitialAdId()).toBeNull();
});
