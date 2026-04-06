# Desktop Capture Helper

This repo includes a lightweight Tauri helper under `src-tauri/`.

Current intent:

- keep a global shortcut registered while the helper app is running
- stay resident in the system tray instead of requiring the helper window to remain open
- open the normal QNote browser capture flow instead of inventing a second capture stack
- reuse browser auth and the existing `/capture` workflow by launching the URL in the default browser
- tolerate common global-hotkey conflicts by trying fallback shortcuts automatically

## Default behavior

- Shortcut: `Ctrl/Cmd + Shift + Space`
- Automatic fallback order: `Ctrl/Cmd + Alt + Space`, then `Ctrl/Cmd + Shift + Alt + Space`
- Left-click tray icon: open capture immediately
- Tray menu: open capture, show helper window, or quit
- Default target: `http://127.0.0.1:3000/capture?source=desktop-hotkey`
- Override target with `QNOTE_DESKTOP_CAPTURE_URL`
- Override shortcut with `QNOTE_DESKTOP_CAPTURE_SHORTCUT`

## Windows prerequisites

- Rust via `rustup`
- Microsoft Visual C++ Build Tools with Desktop development with C++
- WebView2 runtime

Reference:

- Tauri prerequisites: https://v2.tauri.app/start/prerequisites/

## Commands

```bash
npm run desktop:dev
npm run desktop:build
```

## Build output

- `npm run desktop:build` produces packaged Windows NSIS and MSI installers
- Installer output path: `src-tauri/target/release/bundle/nsis/`
- MSI output path: `src-tauri/target/release/bundle/msi/`
- Raw optimized binary path: `src-tauri/target/release/qnote-capture-helper.exe`
- NSIS install mode: `currentUser`
- WebView2 install mode: `downloadBootstrapper`
- MSI packaging requires the Windows VBSCRIPT optional feature

## Current limitations

- This is a helper foundation, not a full offline desktop bundle of the Next.js app.
- The global shortcut only works while the helper app is running in the tray.