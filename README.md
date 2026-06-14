# sympl

Cross-platform React Native MVP for a simplified phone launcher.

## What works now

- Android lists installed launchable apps.
- The user can choose an allowlist and turn Sympl on/off.
- When Sympl is on, the app shows a simplified home screen with only allowed apps.
- Sympl can be selected as the Android default Home app, so pressing Home returns to the simplified screen.
- Settings are stored locally on the device with AsyncStorage.

## Platform notes

Android is implemented as a launcher MVP. This is intentionally not a hard lock yet: a user may still leave through Android settings, recents, notifications, or other system surfaces. Later safeguards can add stronger Android controls through accessibility, device-owner provisioning, or managed-device APIs.

iOS builds share the same React Native app shell, but iPhone system-level app blocking is not available to normal third-party apps. Real app shielding on iOS needs Apple's Screen Time APIs (`FamilyControls` and `ManagedSettings`) plus the Family Controls entitlement and native iOS picker/bridge work.

## Requirements

- Node.js 22.11 or newer
- npm
- Android Studio / Android SDK for Android builds
- Xcode, CocoaPods, and an Apple developer setup for iOS builds

If the Android SDK is installed at `~/Android/Sdk`, export:

```sh
export ANDROID_HOME="$HOME/Android/Sdk"
export ANDROID_SDK_ROOT="$HOME/Android/Sdk"
```

## Install dependencies

```sh
npm install
```

## Run on Android

Start Metro:

```sh
npm start
```

In another terminal, run:

```sh
npm run android
```

To build a debug APK:

```sh
npm run android:debug-apk
```

The debug APK is written to:

```sh
android/app/build/outputs/apk/debug/app-debug.apk
```

## Checks

```sh
npm run typecheck
npm run lint
npm test -- --runInBand
npm run android:debug-apk
```
