#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::str::FromStr;

use tauri::{
  image::Image,
  menu::{Menu, MenuItem},
  tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
  Manager, Runtime, WindowEvent,
};
use tauri_plugin_global_shortcut::{Builder as GlobalShortcutBuilder, Shortcut, ShortcutEvent, ShortcutState};
use url::Url;

const DEFAULT_CAPTURE_SHORTCUT: &str = "CommandOrControl+Shift+Space";
const DEFAULT_CAPTURE_URL: &str = "http://127.0.0.1:3000/capture";
const TRAY_ID: &str = "capture-helper-tray";
const MENU_OPEN_CAPTURE: &str = "open-capture";
const MENU_SHOW_WINDOW: &str = "show-window";
const MENU_QUIT: &str = "quit";

fn build_capture_url() -> String {
  let configured = std::env::var("QNOTE_DESKTOP_CAPTURE_URL").unwrap_or_else(|_| DEFAULT_CAPTURE_URL.to_string());
  let mut parsed = Url::parse(&configured)
    .or_else(|_| Url::parse(DEFAULT_CAPTURE_URL))
    .expect("default capture URL must be valid");

  if !parsed.query_pairs().any(|(key, _)| key == "source") {
    parsed.query_pairs_mut().append_pair("source", "desktop-hotkey");
  }

  parsed.to_string()
}

fn open_capture_target() -> Result<(), String> {
  let capture_url = build_capture_url();
  webbrowser::open(&capture_url)
    .map(|_| ())
    .map_err(|error| format!("Failed to open capture URL: {error}"))
}

fn build_fallback_tray_icon() -> Image<'static> {
  const SIZE: usize = 16;
  let mut rgba = vec![0_u8; SIZE * SIZE * 4];

  let mut set_pixel = |x: usize, y: usize, color: [u8; 4]| {
    let index = (y * SIZE + x) * 4;
    rgba[index..index + 4].copy_from_slice(&color);
  };

  for y in 0..SIZE {
    for x in 0..SIZE {
      set_pixel(x, y, [37, 99, 235, 255]);
    }
  }

  for y in 3..13 {
    for x in 4..12 {
      set_pixel(x, y, [255, 255, 255, 255]);
    }
  }

  for y in 3..6 {
    for x in 4..12 {
      set_pixel(x, y, [29, 78, 216, 255]);
    }
  }

  for y in 7..8 {
    for x in 5..11 {
      set_pixel(x, y, [191, 219, 254, 255]);
    }
  }

  for y in 9..10 {
    for x in 5..11 {
      set_pixel(x, y, [191, 219, 254, 255]);
    }
  }

  Image::new_owned(rgba, SIZE as u32, SIZE as u32)
}

fn show_helper_window<R: Runtime>(app: &tauri::AppHandle<R>) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.show();
    let _ = window.set_focus();
  }
}

fn open_capture_or_show_window<R: Runtime>(app: &tauri::AppHandle<R>) {
  if let Err(error) = open_capture_target() {
    eprintln!("{error}");
    show_helper_window(app);
  }
}

fn build_tray_menu<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<Menu<R>> {
  let open_capture = MenuItem::with_id(app, MENU_OPEN_CAPTURE, "Open Capture", true, Some(DEFAULT_CAPTURE_SHORTCUT))?;
  let show_window = MenuItem::with_id(app, MENU_SHOW_WINDOW, "Show Helper Window", true, None::<&str>)?;
  let quit = MenuItem::with_id(app, MENU_QUIT, "Quit", true, None::<&str>)?;

  Menu::with_items(app, &[&open_capture, &show_window, &quit])
}

fn create_tray<R: Runtime>(app: &tauri::AppHandle<R>) -> tauri::Result<()> {
  let menu = build_tray_menu(app)?;
  let icon = app.default_window_icon().cloned().unwrap_or_else(build_fallback_tray_icon);

  let _ = TrayIconBuilder::with_id(TRAY_ID)
    .tooltip("QNote Capture Helper")
    .icon(icon)
    .menu(&menu)
    .show_menu_on_left_click(false)
    .on_menu_event(|app, event| match event.id.as_ref() {
      MENU_OPEN_CAPTURE => open_capture_or_show_window(app),
      MENU_SHOW_WINDOW => show_helper_window(app),
      MENU_QUIT => app.exit(0),
      _ => {}
    })
    .on_tray_icon_event(|tray, event| {
      if let TrayIconEvent::Click {
        button: MouseButton::Left,
        button_state: MouseButtonState::Up,
        ..
      } = event
      {
        open_capture_or_show_window(tray.app_handle());
      }
    })
    .build(app)?;

  Ok(())
}

fn handle_shortcut_event<R: Runtime>(app: &tauri::AppHandle<R>, event: ShortcutEvent) {
  if event.state != ShortcutState::Pressed {
    return;
  }

  open_capture_or_show_window(app);
}

fn main() {
  let shortcut = Shortcut::from_str(DEFAULT_CAPTURE_SHORTCUT).expect("default shortcut must be valid");

  let shortcut_plugin = GlobalShortcutBuilder::new()
    .with_shortcut(shortcut)
    .expect("default shortcut must register")
    .with_handler(move |app, _shortcut, event| handle_shortcut_event(app, event))
    .build();

  tauri::Builder::default()
    .plugin(shortcut_plugin)
    .setup(|app| {
      create_tray(&app.handle())?;

      if let Some(window) = app.get_webview_window("main") {
        let _ = window.hide();
      }

      Ok(())
    })
    .on_window_event(|window, event| {
      if window.label() != "main" {
        return;
      }

      if let WindowEvent::CloseRequested { api, .. } = event {
        api.prevent_close();
        let _ = window.hide();
      }
    })
    .run(tauri::generate_context!())
    .expect("error while running qnote capture helper")
}