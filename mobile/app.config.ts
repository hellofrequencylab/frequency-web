import type { ExpoConfig } from 'expo/config'

// Frequency Experience: the Frequency member app plus the CyberUnicorn 5000 remote (DEF-MOBILE,
// docs/MOBILE-APP.md). Android first. The native folders are generated (CNG): change native
// behaviour here and in plugins/, never in android/.
//
// Runtime settings come from EXPO_PUBLIC_* variables (mobile/.env.example). They are public by
// design: the Supabase anon key is the same one the website ships to every browser.

const WEB_HOST = 'frequencylocal.com'

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
    permissions: ['android.permission.NFC'],
    // Check-in links and magic links open the app when it is installed (APP-CONTRACT §11, §12).
    // autoVerify needs ANDROID_SHA256_FINGERPRINTS in the site's assetlinks.json (LIVE-714).
    intentFilters: [
      {
        action: 'VIEW',
        autoVerify: true,
        data: [
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/n/' },
          { scheme: 'https', host: WEB_HOST, pathPrefix: '/auth/native' },
        ],
        category: ['BROWSABLE', 'DEFAULT'],
      },
    ],
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-web-browser',
    'expo-font',
    'expo-dev-client',
    [
      'expo-splash-screen',
      { image: './assets/splash-icon.png', imageWidth: 160, backgroundColor: '#FAF4EA', dark: { image: './assets/splash-icon-dark.png', backgroundColor: '#0E0B09' } },
    ],
    ['expo-notifications', { color: '#5B3FD0' }],
    ['expo-location', { locationWhenInUsePermission: 'Frequency uses your location to confirm a check-in at the place you are.' }],
    // jitpack.io serves usb-serial-for-android (modules/usb-serial).
    ['expo-build-properties', { android: { extraMavenRepos: ['https://jitpack.io'] } }],
    // The phone reads venue tags itself (react-native-nfc-manager).
    ['react-native-nfc-manager', { includeNdefEntitlement: false }],
    // Talk to the CyberUnicorn over Bluetooth LE. Not used for location, so neverForLocation.
    ['react-native-ble-plx', { isBackgroundEnabled: false, neverForLocation: true, modes: [] }],
    './plugins/with-usb-host',
  ],
  experiments: {
    typedRoutes: true,
  },
  extra: {
    webHost: WEB_HOST,
    eas: process.env.EAS_PROJECT_ID ? { projectId: process.env.EAS_PROJECT_ID } : undefined,
  },
}

export default config
