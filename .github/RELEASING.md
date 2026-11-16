# Releasing Cyonima MD Editor

## Continuous integration

`.github/workflows/ci.yml` runs on every push to `main`, every pull request and
on demand:

- lint, typecheck, unit tests and production build on Linux, Windows and macOS;
- Playwright/Electron end-to-end tests on Linux under Xvfb.

Playwright is installed with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`: only Electron
is driven, no browser binary is needed.

## Cutting a release

1. Update `version` in `package.json` (semantic versioning).
2. Commit, then create and push a tag. Use `v1.2.3` for stable and
   `v1.2.3-beta.1` for a beta:

   ```bash
   git tag v0.1.0
   git push origin v0.1.0
   ```

3. The workflow generates `resources/release-notes.md` from the commits since
   the previous tag. Tags containing a hyphen are marked as GitHub prereleases.
4. `.github/workflows/release.yml` builds on each operating system:
   - Linux: AppImage, `.deb` and `.rpm`;
   - Windows: NSIS installer (per-machine, so file associations are registered);
   - macOS: DMG for Intel and Apple Silicon.
5. Beta builds also copy `latest*.yml` to `beta*.yml` so the application's beta
   channel can find its metadata.
6. The `publish` job creates or updates the GitHub release and uploads every
   installer, blockmap and update metadata file.

Running the workflow manually (`workflow_dispatch`) builds and uploads the same
artifacts to the workflow run, but does not create a release because there is no
tag.

## Automatic updates

The application uses `electron-updater` with the GitHub provider. Automatic
checks are **off by default** in Preferences, because update installation is
only safe once the builds are signed. Users can enable them and choose the
stable or beta channel; manual checks are always available.

When a downloaded update is ready, the application asks for an explicit
restart. It never installs silently on quit.

## Rolling back

Previous installers remain attached to their GitHub releases. The Preferences
screen has a **Previous versions…** button that opens the releases page; users
can reinstall an older signed build. Preferences and documents are kept outside
the installation directory and are not removed.

## Signing secrets

Signing is optional for local or unsigned builds. Add these repository secrets
to produce signed and notarized artifacts.

| Secret | Purpose |
| --- | --- |
| `WINDOWS_CSC_LINK` | Base64-encoded `.pfx` certificate (or a secret URL accepted by electron-builder). |
| `WINDOWS_CSC_KEY_PASSWORD` | Password of the Windows certificate. |
| `MACOS_CSC_LINK` | Base64-encoded `.p12` Developer ID Application certificate (or secret URL). |
| `MACOS_CSC_KEY_PASSWORD` | Password of the macOS certificate. |
| `APPLE_ID` | Apple ID used for notarization. |
| `APPLE_APP_SPECIFIC_PASSWORD` | App-specific password for that Apple ID. |
| `APPLE_TEAM_ID` | Apple Developer team identifier. |

`mac.notarize` is enabled in `package.json`; when the Apple credentials are
missing, electron-builder skips notarization with a warning. Windows builds are
unsigned when `CSC_LINK` is empty.

Alternatively, `APPLE_API_KEY`, `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` can be
provided for App Store Connect API-key notarization.

## Linux packaging prerequisites

The release workflow installs `rpm` and `xvfb`. The RPM target needs `rpmbuild`
on the runner; the AppImage and `.deb` targets do not. After packaging, the
workflow prints the AppImage size and measures the packaged application's cold
start with `scripts/benchmark.mjs`.
