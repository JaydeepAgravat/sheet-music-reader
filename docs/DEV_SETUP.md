# Dev setup

Bare React Native (0.87, New Architecture, Hermes), Android only. No Expo.

## Prerequisites

- **Node 24** and npm
- **JDK 17** (Temurin)
- **Android SDK** with platform-tools, emulator, build-tools **35+** (needed for `zipalign -P 16`), and the **NDK** version pinned in `android/build.gradle` (`ndkVersion`, currently `27.1.12297006`)
- `android/local.properties` with `sdk.dir=...` (not committed)

Tip: export the SDK location in your shell profile so tools and scripts find it:

```sh
export ANDROID_HOME="$HOME/Library/Android/sdk"
export PATH="$ANDROID_HOME/platform-tools:$ANDROID_HOME/emulator:$PATH"
```

## Install

```sh
npm ci
```

## Run on an emulator or device

```sh
npm start            # Metro bundler (keep it running)
npm run android      # build + install the debug app on the running emulator/device
```

Start an emulator with `emulator -avd <name>` (or from Android Studio's Device Manager).

## Emulators (AVDs)

| AVD | Image | Screen | Purpose |
|---|---|---|---|
| `Tab_11_16x10` | API 35, Google Play | 1600x2560 @ 320 dpi (~800 dp wide) | Main 11" 16:10 tablet target (Galaxy Tab S9 class) |
| `Tab_12_16x10` | API 35, Google Play | 1752x2800 @ 266 dpi | Large 12.4" 16:10 tablet |
| `Tab_3x2` | API 35, Google Play | 1920x2880 @ 240 dpi | 3:2 panel (TCL NXTPAPER 14 class), tall-page layouts |
| `Phone_16k` | API 37, 16 KB page size | 1080x2400 @ 420 dpi | Phone layout + 16 KB page-size runtime testing |

All have a hardware keyboard enabled (page-turn key testing) and no device frame.

## Checks

```sh
npm run verify       # typecheck + lint + Jest (same as the CI "js" job)
npm run icons        # regenerate src/ui/icons/glyphs.ts from scripts/icons.json (Phosphor + design/icons/custom)
npm run check:16kb -- android/app/build/outputs/apk/release/app-release.apk
```

`check:16kb` fails if any `arm64-v8a`/`x86_64` `.so` in the APK/AAB is not 16 KB aligned, using both
`zipalign -c -P 16` (APK only) and the ELF `LOAD` segment alignment (`llvm-readelf` from the NDK).

CI (`.github/workflows/ci.yml`) runs `verify`, then `assembleRelease` and the 16 KB check, and uploads the APK.

## Git

The repo uses a **repo-local git identity** (set with `git config user.name/user.email` inside the repo,
not `--global`). Check with `git config --local --list` before committing. Use conventional commits.
