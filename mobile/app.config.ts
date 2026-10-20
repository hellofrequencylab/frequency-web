import type { ExpoConfig } from 'expo/config'

// Frequency Experience (docs/MOBILE-APP.md, ADR-1865). This pass is the CyberUnicorn 5000 remote
// only: USB OTG and Bluetooth LE, no account and no network needed. The member experience slots in
// later (DEF-MOBILE). Android first. The native folders are generated (CNG): change native behaviour
// here and in plugins/, never in android/.

const config: ExpoConfig = {
  name: 'Frequency Experience',
  slug: 'frequency-experience',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  // The contract's own scheme (docs/APP-CONTRACT.md §11): frequency://auth/callback, frequency://n/<id>.
  scheme: 'frequency',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#FAF4EA',
  ios: {
    supportsTablet: false,
    bundleIdentifier: 'com.frequencylocal.experience',
  },
  android: {
    package: 'com.frequencylocal.experience',
    adaptiveIcon: {
      backgroundColor: '#FAF4EA',
      foregroundImage: './assets/android-icon-foreground.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    // Nothing the remote does needs these; keep them out of the manifest.
    blockedPermissions: ['android.permission.RECORD_AUDIO', 'android.permission.SYSTEM_ALERT_WINDOW'],
  },
  plugins: [
    'expo-router',
    'expo-font',
    'expo-dev-client',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#FAF4EA', dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#0E0B09' } },
    ],
    // jitpack.io serves usb-serial-for-android (modules/usb-serial).
    ['expo-build-properties', { android: { extraMavenRepos: ['https://jitpack.io'] } }],
    // Talk to the CyberUnicorn over Bluetooth LE. Not used for location, so neverForLocation.
    ['react-native-ble-plx', { isBackgroundEnabled: false, neverForLocation: true, modes: [] }],
    './plugins/with-usb-host',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
}

export default config
