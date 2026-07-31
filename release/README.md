# Releases

Signed Android builds. Each is a full APK, install it directly, no store needed.

Newest first.

| File | versionCode | Notes |
|---|---|---|
| `bench-v1.7.apk` | 9 | Illustrated landing page, About tab with the changelog, light theme by default, readable buttons in dark mode |
| `bench-v1.6.apk` | 8 | Anabolics and HGH, custom compounds, PWA with update prompt, shared data migration, about and landing pages |

## Installing

Download the APK to the phone and open it. Android will ask you to allow installs from
whichever app you downloaded it with; that prompt is expected for anything outside the
Play Store.

## Upgrading

Install straight over the top. **Do not uninstall first**, an in-place upgrade keeps your
data, and an uninstall erases it. Every build here is signed with the same key, which is
what makes the in-place upgrade possible.

Your data is never touched by an update. Migrations run on load and are covered by tests
that check an old backup restores completely and stays visible.

## Signing

These are signed with a local debug keystore, which is fine for sideloading to your own
devices and to people who know you. It is not suitable for Play Store distribution, and
the signature must not change between builds or the upgrade path breaks.

## Backups

Before a major upgrade, it costs nothing to copy `Documents/Bench` off the device.
The app writes rotating backups there automatically.
