# expo-updates + app-wide OkHttp factory (Android, SDK 58)

Minimal reproduction for an expo-updates regression on Android in SDK 58.

Since [expo/expo#47010](https://github.com/expo/expo/pull/47010) (first
released in SDK 58), the Android `FileDownloader` in expo-updates builds its
OkHttp client from `OkHttpClientProvider.getOkHttpClient().newBuilder()`
instead of its own `OkHttpClient.Builder()`. Any app-wide customisation
registered with `OkHttpClientProvider.setOkHttpClientFactory(...)`
(interceptors, a `CertificatePinner`, a custom `SSLSocketFactory`) therefore
also applies to update manifest and asset requests, and there is no way to opt
out. On SDK 57 the downloader used its own client.

This app registers a factory whose interceptor rejects every request, standing
in for a certificate pin set or interceptor that does not match the updates
host. The update check then fails before any request reaches the update
server.

The proposed fix, [expo/expo#53414](https://github.com/expo/expo/pull/53414),
adds an Android-only `updates.useReactNativeHttpClient` option (default
`true`, the current behaviour). With `false`, `FileDownloader` starts from a
plain `OkHttpClient.Builder()` again. The FIX variant of this app applies that
change as a patch.

## Versions

| Package | Version |
| --- | --- |
| expo | 58.0.25 |
| expo-updates | 58.0.22 |
| @expo/config-plugins | 58.0.13 |
| react-native | 0.88.1 |
| react | 19.3.0 |

Created with `npx create-expo-app@latest --template blank@sdk-58`. Exact
versions are locked in `package-lock.json`. Package manager: npm.

Tested on an Android emulator (API 36, arm64) with a release build signed with
the debug keystore.

## What is in the repo

| Path | Purpose |
| --- | --- |
| `App.js` | Shows which bundle is running (`EMBEDDED` or `UPDATE <n>`), the variant, `Updates.isEmbeddedLaunch`, `Updates.updateId`, and a "Check for update" button that runs `checkForUpdateAsync()`, `fetchUpdateAsync()` and `reloadAsync()` and prints any error on screen. |
| `app.config.js` | `updates.url` points at the local server, `runtimeVersion` is fixed at `1.0.0`, automatic checks are off. `REPRO_VARIANT=fix` adds `updates.useReactNativeHttpClient: false`. |
| `plugins/withRejectingOkHttpFactory.js` | Config plugin. Injects the rejecting OkHttp factory at the start of `MainApplication.onCreate` (before expo-updates starts) and adds a network security config that allows cleartext HTTP to `10.0.2.2`, `localhost` and `127.0.0.1` only, because release builds block cleartext by default and the local server is plain HTTP. |
| `server/index.js` | Minimal expo-updates protocol (v1) server, Node built-ins only. Serves a multipart manifest for the latest update in `updates/<runtimeVersion>/<n>/` and its assets, and logs every request. No code signing. |
| `scripts/publish-update.js` | Runs `npx expo export --platform android` with `EXPO_PUBLIC_BUNDLE_LABEL="UPDATE <n>"` into `updates/1.0.0/<n>/` and writes `expoConfig.json` next to it. |
| `patches-fix/` | The runtime parts of expo/expo#53414 as `patch-package` patches: `UpdatesConfiguration.kt`, `FileDownloader.kt` and the new `BaseHttpClient.kt` in expo-updates, and the Android config-plugin change in `@expo/config-plugins` that writes the `expo.modules.updates.USE_REACT_NATIVE_HTTP_CLIENT` meta-data. They are not applied on install; see below. |

The factory injected into `MainApplication`:

```kotlin
OkHttpClientProvider.setOkHttpClientFactory {
  OkHttpClientProvider.createClientBuilder()
    .addInterceptor { throw java.io.IOException("rejected by app-wide factory") }
    .build()
}
```

## Prerequisites

- Node 20 or newer, npm.
- Android SDK and an emulator. The app reaches the host through `10.0.2.2`, the
  emulator's alias for the host loopback. On a physical device, set
  `PUBLIC_URL` and `updates.url` to an address the device can reach and add it
  to the network security config in the plugin.
- JDK 17 or newer (Android Studio's bundled JBR works).

## Reproduce the bug

```sh
npm install

# 1. Generate the native project and build a release APK (stock expo-updates).
REPRO_VARIANT=bug npx expo prebuild -p android --clean
cd android && REPRO_VARIANT=bug ./gradlew assembleRelease && cd ..
adb install -r android/app/build/outputs/apk/release/app-release.apk

# 2. Publish update 1. Publish AFTER building the APK: expo-updates ignores an
#    update whose createdAt is older than the embedded bundle.
REPRO_VARIANT=bug npm run publish-update -- 1

# 3. Start the update server on port 9400.
npm run update-server
```

Open the app. It shows `EMBEDDED`, `Variant: bug`,
`Updates.isEmbeddedLaunch: true`. Press **Check for update**.

**Expected** (as on SDK 57): the update manifest and launch asset download, the
app reloads and shows `UPDATE 1`.

**Actual** (SDK 58): the screen shows

```
ERROR: Call to function 'ExpoUpdates.checkForUpdateAsync' has been rejected.
-> Caused by: Failed to check for update: Failed to download remote update: rejected by app-wide factory [ERR_UPDATES_CHECK]
```

and the update server logs no request at all: the app-wide interceptor rejected
the manifest request inside the app.

To use a port other than 9400, set `PORT` for the server and
`UPDATE_SERVER_PORT` to the same value for `prebuild` (it is written into
`AndroidManifest.xml`) and for `publish-update`.

## Check the proposed fix (expo/expo#53414)

```sh
npm run fix:apply

REPRO_VARIANT=fix npx expo prebuild -p android --clean
cd android && REPRO_VARIANT=fix ./gradlew assembleRelease && cd ..
adb uninstall com.example.okhttprepro
adb install android/app/build/outputs/apk/release/app-release.apk

REPRO_VARIANT=fix npm run publish-update -- 1
npm run update-server
```

`REPRO_VARIANT` must be set for both `prebuild` (native meta-data) and the
Gradle build (the embedded app config that `expo-constants` reads), or the
screen shows the wrong variant name.

Open the app (`EMBEDDED`, `Variant: fix`) and press **Check for update**. The
server logs the manifest requests (one from the check, one from the fetch) and
the launch asset request, the app reloads
and shows `UPDATE 1`, `Updates.isEmbeddedLaunch: false` and the update id from
the server log.

Control: with the patch applied but `useReactNativeHttpClient` unset
(`REPRO_VARIANT=bug`), the update check still fails with "rejected by app-wide
factory" and the server sees no request, because the option defaults to `true`.
Only the new option changes the result.

To go back to the BUG variant, run `npm run fix:revert`, then repeat the BUG
steps from `prebuild --clean` (uninstall the app first and publish again after
building).

## Credits

`server/index.js` follows the manifest and asset handling of Expo's
MIT-licensed reference server,
[expo/custom-expo-updates-server](https://github.com/expo/custom-expo-updates-server).
The app scaffold comes from `create-expo-app` (MIT, see `LICENSE`).
