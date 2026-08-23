# Runbook

Every command assumes you are in the project root. Note that the folder is
literally named `untitled folder`, with a space, so paths need quoting.

```bash
cd "/Users/arun/Documents/untitled folder"
```

## Develop

```bash
npm install
npm run dev
```

Port 3210, not 3000, so it never fights another dev server.

**If the page renders unstyled, or your changes do not appear, it is almost
certainly one of these two:**

1. A dev server left running from an earlier session is holding port 3210, and
   a `npm run build` since then has overwritten its `.next`. Kill it, delete
   `.next`, start again.
2. The service worker is serving a stale cached bundle. It is cache-first, and
   it will happily serve you code from ten minutes ago while you conclude your
   edit did nothing. Clear it in the browser console:

```js
(async () => {
  const regs = await navigator.serviceWorker.getRegistrations();
  await Promise.all(regs.map(r => r.unregister()));
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  location.reload();
})()
```

This cost real time more than once. Suspect it early.

## Check

```bash
npx tsc --noEmit          # stale .next/types TS6053 errors are noise, a build clears them
npx next lint
npm test
TZ=America/New_York npm test    # DST boundaries have caught real bugs
```

The full gate before shipping anything: tsc clean, lint clean, 774 tests passing
in at least two timezones, web build succeeds, Android build succeeds.

## Icons

```bash
node scripts/icons.mjs
```

Regenerates every icon from `assets/brand-icon.svg`: Android adaptive foreground
at five densities, legacy launcher PNGs, web and PWA icons, favicon, and the
`androidicon.png` preview. Never hand-edit the outputs.

## Web build

```bash
npm run build
```

Stamps `public/version.json` first, which is what the update prompt compares
against.

Deploy is Vercel, done by Arun. Do not attempt it.

| Branch | URL | Purpose |
|--------|-----|---------|
| `main` | [benchpep.vercel.app](https://benchpep.vercel.app) | Production - tagged releases only |
| `beta` | [benchpep-beta.vercel.app](https://benchpep-beta.vercel.app) | Staging - new features land here first |

### Branch workflow

New features go on a feature branch, get merged into `beta` via PR (direct push
allowed only for Arun), and are tested at the beta URL before being promoted to
`main`. Releases are triggered by pushing a version tag to `main`.

## Android

Needs JDK 21:

```bash
export JAVA_HOME="/Applications/Android Studio.app/Contents/jbr/Contents/Home"
export PATH="$PATH:$HOME/Library/Android/sdk/platform-tools"

npm run android:sync                       # static build plus cap sync
cd android && ./gradlew assembleRelease
```

Output: `android/app/build/outputs/apk/release/app-release.apk`.

Kotlin metadata warnings from the health plugin during `lintVital` are expected
and harmless.

### Install

Package id is `app.bench.peptide` (not `com.`).

```bash
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

`-r` is an in-place upgrade and **preserves user data**. It is also safe to
attempt: if the signing certificate did not match, Android refuses the install
outright rather than wiping anything.

Confirm the upgrade really was in place:

```bash
adb shell dumpsys package app.bench.peptide | grep -E "versionCode|versionName|firstInstallTime"
```

An unchanged `firstInstallTime` means the data survived. A new one means it was
a fresh install and the data is gone.

### Release

Bump both, in `android/app/build.gradle`:

```
versionCode 9
versionName "1.7"
```

Add a matching entry at the top of `src/lib/changelog.ts`. The About tab reads
it, so a screenshot of that screen identifies the exact build. Keep the two
version strings in step.

Then copy the APK and refresh the shareable copy on the phone:

```bash
cp android/app/build/outputs/apk/release/app-release.apk release/bench-v1.7.apk
adb push release/bench-v1.7.apk /sdcard/Download/Bench-v7.apk
```

Update the table in `release/README.md`.

### Signing, and why it matters

Release builds are signed with the **local debug keystore**, deliberately. The
signature is what allows an in-place upgrade. Change the key and every existing
install must be uninstalled first, which erases the user's data with no warning.
Read the comment in `android/app/build.gradle` before touching the signing
config.

## Verifying without touching the phone's screen

Do not drive the launcher UI. Everything below is read only.

```bash
# crashes
adb logcat -d -t 200 | grep -iE "FATAL|AndroidRuntime"

# the automatic backups, a useful side channel: they reveal whether data survived
adb shell ls -la /sdcard/Documents/Bench/

# what is actually inside the APK
unzip -l app-release.apk | grep res/
aapt2 dump resources app-release.apk | grep -A8 "mipmap/ic_launcher$"
aapt2 dump xmltree app-release.apk --file res/<name>.xml
```

`aapt2` lives in `~/Library/Android/sdk/build-tools/<version>/`.

Resource filenames inside a release APK are obfuscated by AAPT2, so find PNGs by
dimension rather than by name.
