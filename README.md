# Focus

A faithful, open recreation of **Focusd** — every perspective, behaviour
and interaction, everything except the icons — that runs from one codebase on
**macOS, Windows, Linux, iPhone, iPad and the web**.

- All behaviour is a Rust core (`core/`): the data model from
  `the data model`, availability / blocking / next-action derivation,
  Inbox · Projects · Tags · Forecast · Flagged · Nearby · Review, repetition
  rules, review scheduling, natural-language dates (`tomorrow 5pm`, `fri`,
  `2w`, `sep 20`), undo/redo, JSON persistence. No `unsafe`. 22 behaviour
  tests.
- The UI is React + TypeScript (`app/`) rendering snapshots computed by the
  core, styled pixel-for-pixel after Focusd for Mac (see `ref/`), with
  the iPhone and iPad layouts of Focusd for iOS and a dark appearance.
- Tauri 2 (`desktop/`) hosts it natively: real window with the toolbar in
  the title bar, native menu bar with every Focusd menu and shortcut,
  window-state restore, deep links (`focus://add?name=…`), system
  notifications, calendar feeds in Forecast, and **Mail Drop** over IMAP.
  The same host builds the iOS / iPadOS app.
- The web build runs the identical core compiled to WebAssembly, persisting
  to IndexedDB.

## Features

Perspectives bar with badges (⌘1–⌘7). Projects with folders, parallel /
sequential / single-action types, action groups, on hold / completed /
dropped, Focus / Unfocus. Nested tags with on-hold / dropped /
allows-next-action and Untagged. Forecast with Past / 14 days / Future
calendar sidebar, planned and deferred inclusion, and subscribed calendar
events. Flagged with grouping. Review with "Project 1 of N", intervals and
Mark Reviewed. Outline with status circles (overdue, due soon, flagged,
blocked), disclosure triangles, completed rows kept until Clean Up (⌘K),
multi-selection, context menus, drag & drop reorder / nesting, inline dates,
tags, project and notes, duplicate, convert to project. Inspector with
status, type, tags, defer / planned / due, repeat editor, estimates, review
settings, notes. View Options per perspective. Quick Entry (⌃⌥Space), Quick
Open (⌘O), undo / redo, import / export, Settings (⌘,) with notifications,
calendar feeds, Mail Drop and appearance.

### Integrations

| | |
|---|---|
| **Mail Drop** | Point the app at an IMAP folder (a dedicated Gmail label, a `+focus` sub-address…). Unread mail becomes Inbox items: subject → name, body → note, `!` prefix → flagged. Password stays in the OS keychain. |
| **Calendar** | Subscribe to ICS / webcal feeds; events (including recurring ones) appear on their days in Forecast. |
| **URL scheme** | `focus://add?name=Buy%20milk&note=2%20litres&flag=1` from any app or a mail rule. |
| **Notifications** | System notifications when items come due, optionally N minutes ahead (browser notifications on the web). |

## Building

```bash
# core
cargo test -p hemlixfocus_core

# web (wasm core)
rustup target add wasm32-unknown-unknown && cargo install wasm-bindgen-cli
./scripts/build-wasm.sh && cd app && npm install && npm run dev   # http://localhost:5180

# desktop (macOS / Windows / Linux)
cargo install tauri-cli --version '^2'
cd desktop && cargo tauri dev        # or: cargo tauri build

# iOS (Xcode required; `sudo xcode-select -s /Applications/Xcode.app`)
cd desktop && cargo tauri ios init && cargo tauri ios dev "iPhone 18 Pro"
```

CI builds and tests the core, the web bundle (deployed to GitHub Pages) and
the macOS / Linux / Windows bundles on every push.

## Layout

```
core/       Rust core + JSON bridge (bridge.rs) + wasm export (wasm.rs)
app/        React UI; src/core = typed API + store; src/legacy = the original prototype
desktop/    Tauri host: lib.rs (IPC), menu.rs, calendar.rs, maildrop.rs, notify.rs
scripts/    build-wasm.sh
ref/        Focusd reference screenshots
```

## Not replicated

Cloud sync (use export / import), encryption, attachments, rich-text notes,
Nearby location services, Apple Watch / visionOS, custom perspectives (Pro),
automation. Android builds are supported by the Tauri host but are not
part of CI yet.
