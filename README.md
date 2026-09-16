# HemlixFocus

A 1:1 recreation of **Focusd** as a native **iPhone / iPad / Mac** app.

All behaviour lives in a Rust core (`core/`) that is a direct port of the
verified web prototype (`prototype-web/`). The Apple app (`apple/`) is a thin
SwiftUI shell that talks to the Rust core through UniFFI-generated Swift
bindings — one shared codebase compiles for iOS, iPadOS and macOS.

```
core/       Rust: data model (mirrors the data model), availability / blocking /
            next-action derivation, per-perspective outline + sidebar models,
            repetition rules, review scheduling, natural-language dates,
            undo/redo, JSON persistence. Unit-tested (cargo test).
bindgen/    uniffi-bindgen CLI used by the build script
apple/      project.yml (XcodeGen), SwiftUI sources, generated bindings
scripts/    build-core.sh — Rust libs + Swift bindings + xcframework
prototype-web/  the original React reference implementation
ref/        screenshots of the real Focusd used as reference
```

## Building the app

Requires a Mac with Xcode (full, not just Command Line Tools), Rust with the
Apple targets, and XcodeGen (`brew install xcodegen`):

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
./scripts/build-core.sh     # staticlibs + UniFFI bindings + xcframework
cd apple && xcodegen && open HemlixFocus.xcodeproj
```

One universal target (`HemlixFocus`) covers iPhone, iPad and Mac — pick the
destination (My Mac / any iPhone or iPad) and build with ⌘R. The UniFFI
bindings live in a `HemlixFocusCore` framework target that the app target
links.

Without Xcode, `build-core.sh` still compiles the macOS Rust library, runs
`cargo check` for both iOS targets, and generates the Swift bindings — only
the xcframework packaging requires Xcode.

## Working on the core only

```bash
cargo test -p hemlixfocus_core    # 16 behaviour tests
cargo check -p hemlixfocus_core --target aarch64-apple-ios
```

The Rust `Store` object (see `core/src/store.rs`) is the entire app API:
content/sidebar models per perspective, all mutations (complete, drop, flag,
move, indent/outdent, repeat, review…), view options, settings, undo, and
JSON import/export. The SwiftUI layer holds only transient state (selection,
search text, sheet visibility).

## What was copied from the real app

Data model, vocabulary, colours and behaviours were taken from Focusd:
the AppleScript dictionary (`the data model`), the shipped tutorial database
(tags tree + tutorial project as seed data), `en.lproj` strings,
`OFIAppearance.plist` metrics (290 px inspector, indentation, row heights),
and screenshots of every perspective (in `ref/`).

## Features

Perspectives bar with badges (⌘1–⌘7): Inbox, Projects, Tags, Forecast,
Flagged, Nearby, Review. Projects with folders, parallel / sequential /
single-action types, action groups, on-hold / completed / dropped, Focus /
Unfocus. Nested tags with on-hold / dropped / allows-next-action and
Untagged. Forecast with Past / 14 days / Future calendar sidebar and
planned / deferred inclusion. Flagged with grouping. Review with "Project
1 of N", intervals, Mark Reviewed. Outline with status circles (overdue,
due soon, flagged, blocked dashed), disclosure triangles, completed rows
kept until Clean Up (⌘K), multi-selection, context menus, drag & drop
reorder / nesting, natural-language dates (`tomorrow 5pm`, `fri`, `2w`,
`sep 20`, `+1m`). Inspector with repeat editor, estimates, review settings.
View Options per perspective. Quick Entry (⌃⌥Space), Quick Open (⌘O),
undo / redo, JSON import / export, tutorial reset.

## Not replicated

Cloud sync, encryption, attachments, rich-text notes, Nearby location
services, calendar events, notifications, Apple Watch / Vision Pro,
custom perspectives (Pro), automation. The database file format is
JSON, not `.json`.
