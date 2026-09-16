# Working in this repo

A 1:1 recreation of Focusd (everything except the icons) that runs on
macOS, Windows, Linux, iOS, iPadOS and the web from one codebase.

```
core/      Rust — ALL behaviour (model, availability/blocking, perspectives,
           repeats, review, natural-language dates, undo, persistence, JSON
           bridge, wasm export). #![deny(unsafe_code)].
app/       React + TypeScript UI (Vite). Renders Snapshots from the core.
desktop/   Tauri 2 host: native window/menu, on-disk database, calendar
           feeds (ICS), Mail Drop (IMAP), notifications, deep links.
           #![forbid(unsafe_code)]. Also the iOS/Android host (gen/).
scripts/   build-wasm.sh — core → app/wasm for the web build.
ref/       Screenshots of the real Focusd used as the visual spec.
```

## Rules

- **No `unsafe` in Rust.** The only exception is `core/src/wasm.rs`, where
  the `#[wasm_bindgen]` macro itself expands to FFI glue.
- **Behaviour lives in `core/`, never in TypeScript.** The UI calls
  `store.api.*` (app/src/core/api.ts → core/src/bridge.rs) and renders the
  returned `Snapshot`. If the UI needs data it cannot get, add it to the
  core and to `app/src/core/types.ts` (camelCase mirror of the Rust types).
- Presentation-only helpers (date *formatting*) live in
  `app/src/core/format.ts`; date *parsing* is `api.parseDate`.
- One commit per step; keep `cargo test`, `cargo clippy -D warnings`,
  `npm run typecheck` green.
- Compare against `ref/*.png` with `app/tools/shot.mjs` before calling
  visual work done.

## Commands

```bash
cargo test -p hemlixfocus_core             # core behaviour tests
cargo clippy -p hemlixfocus_core -- -D warnings
./scripts/build-wasm.sh                    # needs wasm-bindgen-cli
cd app && npm install && npm run dev       # web build at :5180 (wasm core)
cd app && npm run typecheck && npm run build
cd desktop && cargo tauri dev              # native desktop (native core)
cd desktop && cargo tauri build            # .app/.dmg, .msi, .deb/.AppImage
cd desktop && cargo tauri ios dev "iPhone 18 Pro"   # needs full Xcode selected
node app/tools/shot.mjs out.png http://localhost:5180/ 1500 980 "<js>"
```

## Conventions

- Core timestamps: i64 milliseconds, local wall-clock (chrono + Local).
- JSON bridge: `dispatch(store, method, args)`; args keyed by parameter
  name; tri-state args use `{ "v": x }` (see `tri()` in bridge.rs).
- `after: ""` in move methods means "insert as first sibling".
- Serde: every exported struct/enum is `rename_all = "camelCase"`; row
  enums are internally tagged with `kind`.
- UI layouts: `body[data-layout]` = compact (<700px, phone) | regular
  (<1000px, tablet) | wide (Mac). Dark mode: `body.dark` via
  `app/src/core/appearance.ts` and `app/src/styles/dark.css`.
