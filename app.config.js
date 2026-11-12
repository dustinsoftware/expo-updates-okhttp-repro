const UPDATE_SERVER_PORT = process.env.UPDATE_SERVER_PORT || '9400';
const variant = process.env.REPRO_VARIANT === 'fix' ? 'fix' : 'bug';

const updates = {
  url: `http://10.0.2.2:${UPDATE_SERVER_PORT}/api/manifest`,
  checkAutomatically: 'NEVER',
  ...(variant === 'fix' ? { useReactNativeHttpClient: false } : {}),
};

module.exports = {
  expo: {
    name: 'expo-updates-okhttp-repro',
    slug: 'expo-updates-okhttp-repro',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    runtimeVersion: '1.0.0',
    updates,
    extra: { reproVariant: variant },
    android: {
      package: 'com.example.okhttprepro',
      adaptiveIcon: {
        backgroundColor: '#E6F4FE',
        foregroundImage: './assets/android-icon-foreground.png',
        backgroundImage: './assets/android-icon-background.png',
        monochromeImage: './assets/android-icon-monochrome.png',
      },
    },
    plugins: ['expo-updates', './plugins/withRejectingOkHttpFactory'],
  },
};
