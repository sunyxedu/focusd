# Focusd

**Task management and planning for every screen you own.** One codebase runs
natively on macOS, Windows, Linux, iPhone and iPad, and in the browser — with
the same behaviour, keyboard shortcuts and look everywhere.

Focusd follows the classic capture → organise → plan → review workflow:

- **Capture** anything into the Inbox — from the app, with Quick Entry
  (⌃⌥Space) from any window, through the `focusd://add` URL scheme, or by
  e-mailing a Mail Drop mailbox.
- **Organise** into projects (parallel, sequential or single-action lists),
  folders, action groups and nested tags, with defer / planned / due dates,
  estimates and repeat rules.
- **Plan** your days in Forecast: due and planned items laid out day by day
  next to your subscribed calendars, with badges that tell you what needs
  attention now.
- **Review** each project on its own schedule so nothing goes stale.

## Architecture

- **Rust core** (`core/`): the whole data model and every behaviour —
  availability, blocking and next-action derivation, the seven built-in
  perspectives (Inbox · Projects · Tags · Forecast · Flagged · Nearby ·
  Review), repeat rules, review scheduling, natural-language dates
  (`tomorrow 5pm`, `fri`, `2w`, `sep 20`), undo/redo, JSON persistence.
  No `unsafe`. 22 behaviour tests.
- **React + TypeScript UI** (`app/`) that only renders snapshots computed
  by the core: a Mac-style three-pane layout, phone and tablet layouts, and
  a dark appearance.
- **Tauri 2 host** (`desktop/`) for the native apps: a real window with the
  toolbar in the title bar, a full native menu bar, window-state restore,
  deep links, system notifications, calendar feeds and Mail Drop. The same
  host builds the iOS / iPadOS app.
- **Web build**: the identical core compiled to WebAssembly, persisting to
  IndexedDB.

## Features

Perspectives bar with badges (⌘1–⌘7). Projects with folders, parallel /
sequential / single-action types, action groups, on hold / completed /
dropped, Focus / Unfocus. Nested tags with on-hold / dropped /
allows-next-action and Untagged. Forecast with a Past / 14 days / Future
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
| **Mail Drop** | Point the app at an IMAP folder (a dedicated Gmail label, a `+focusd` sub-address…). Unread mail becomes Inbox items: subject → name, body → note, `!` prefix → flagged. The password stays in the OS keychain. |
| **Calendar** | Subscribe to ICS / webcal feeds; events (including recurring ones) appear on their days in Forecast. |
| **URL scheme** | `focusd://add?name=Buy%20milk&note=2%20litres&flag=1` from any app or a mail rule. |
| **Notifications** | System notifications when items come due, optionally N minutes ahead (browser notifications on the web). |

## Building

```bash
# core
cargo test -p focusd_core

# web (wasm core)
rustup target add wasm32-unknown-unknown && cargo install wasm-bindgen-cli
./scripts/build-wasm.sh && cd app && npm install && npm run dev   # http://localhost:5180

# desktop (macOS / Windows / Linux)
cargo install tauri-cli --version '^2'
cd desktop && cargo tauri dev        # or: cargo tauri build

# iOS (Xcode required; `sudo xcode-select -s /Applications/Xcode.app`)
cd desktop && cargo tauri ios dev "iPhone 17"
```

CI builds and tests the core, the web bundle (deployed to GitHub Pages) and
the macOS / Linux / Windows bundles on every push.

## Layout

```
core/       Rust core + JSON bridge (bridge.rs) + wasm export (wasm.rs)
app/        React UI; src/core = typed API + store; src/components = the views
desktop/    Tauri host: lib.rs (IPC), menu.rs, calendar.rs, maildrop.rs, notify.rs
scripts/    build-wasm.sh
```

## Roadmap

Cloud sync, attachments, rich-text notes, location-based Nearby, custom
perspectives, automation. Android builds are supported by the Tauri host but
are not part of CI yet.

## License

MIT.
