import { Capacitor } from '@capacitor/core';

const appIdPattern = /^ca-app-pub-\d{16}~\d{10}$/;
const adUnitIdPattern = /^ca-app-pub-\d{16}\/\d{10}$/;

const ids = {
  android: {
    app: import.meta.env.VITE_ADMOB_ANDROID_APP_ID?.trim() ?? '',
    interstitial: import.meta.env.VITE_ADMOB_ANDROID_INTERSTITIAL_ID?.trim() ?? '',
  },
  ios: {
    app: import.meta.env.VITE_ADMOB_IOS_APP_ID?.trim() ?? '',
    interstitial: import.meta.env.VITE_ADMOB_IOS_INTERSTITIAL_ID?.trim() ?? '',
  },
};

export function getInterstitialAdId(): string | null {
  const platform = Capacitor.getPlatform();
  if (platform !== 'android' && platform !== 'ios') return null;

  const { app, interstitial } = ids[platform];
  return appIdPattern.test(app) && adUnitIdPattern.test(interstitial) ? interstitial : null;
}
