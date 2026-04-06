# Desktop Capture Helper

This repo includes a lightweight Tauri helper under `src-tauri/`.

Current intent:

- keep a global shortcut registered while the helper app is running
- stay resident in the system tray instead of requiring the helper window to remain open
- open the normal QNote browser capture flow instead of inventing a second capture stack
- reuse browser auth and the existing `/capture` workflow by launching the URL in the default browser

## Default behavior

- Shortcut: `Ctrl/Cmd + Shift + Space`
- Left-click tray icon: open capture immediately
- Tray menu: open capture, show helper window, or quit
- Default target: `http://127.0.0.1:3000/capture?source=desktop-hotkey`
- Override target with `QNOTE_DESKTOP_CAPTURE_URL`

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

## Current limitations

- This is a helper foundation, not a full offline desktop bundle of the Next.js app.
- The global shortcut only works while the helper app is running in the tray.
- This environment did not have Rust tooling installed, so the Tauri build could not be compile-verified here.