import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.mochi.game',
  appName: 'Mochi',
  webDir: 'dist',
  server: {
    iosScheme: 'capacitor',
    androidScheme: 'https',
    cleartext: false,
    allowNavigation: [
      'game.lenout.com',
      'api-game.lenout.com',
      'assets-game.lenout.com',
      'game-staging.lenout.com',
      'api-staging.lenout.com',
      'assets-staging.lenout.com',
      'localhost:5173'
    ]
  },
  plugins: {
    // @capacitor/haptics has no configuration keys; this entry records that
    // the plugin is part of the native container so `cap sync` includes it.
    Haptics: {},
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: '#090b10',
      androidSplashResourceName: 'splash',
      androidScaleType: 'CENTER_CROP',
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#090b10',
      overlaysWebView: true
    },
    ScreenOrientation: {
      orientation: 'landscape'
    },
    Keyboard: {
      resize: 'body',
      style: 'DARK',
      resizeOnFullScreen: true
    }
  },
  ios: {
    contentInset: 'never',
    preferredContentMode: 'mobile',
    scheme: 'Mochi'
  },
  android: {
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false
  }
};

export default config;
