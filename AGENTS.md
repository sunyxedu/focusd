# Working in this repo

HemlixFocus recreates Focusd as a native Apple app. Architecture:

- `core/` — Rust crate `hemlixfocus_core`, all app behaviour. UniFFI exports
  the `Store` object; never put behaviour in Swift.
- `apple/Sources/HemlixFocus/` — SwiftUI shell (shared iOS/iPadOS/macOS).
- `apple/Sources/HemlixFocusCore/` — generated UniFFI Swift bindings.
  Do not edit; regenerate with `scripts/build-core.sh`.
- `prototype-web/` — React reference implementation; port behaviour from here.

## Commands

- `cargo test -p hemlixfocus_core` — behaviour tests; must pass.
- `cargo check -p hemlixfocus_core --target aarch64-apple-ios` (and
  `aarch64-apple-ios-sim`) — iOS compilation check; must pass.
- `./scripts/build-core.sh` — release libs + bindings (+ xcframework when
  Xcode is installed).
- `cd apple && xcodegen` — regenerate the Xcode project after editing
  `apple/project.yml` or adding source files.

## Constraints

- This machine has only Command Line Tools: Swift cannot be compiled here and
  iOS release builds cannot link. Verify Rust changes with the commands above;
  write Swift conservatively and review it against
  `target/uniffi-gen/HemlixFocusCore.swift` for the exact generated API.
- Rust core timestamps are i64 milliseconds, local wall-clock semantics
  (chrono + Local). UniFFI converts them to Swift `Int64`.
- UniFFI 0.32: callback interfaces are taken as `Box<dyn Trait>`; records need
  all fields; enums may carry payloads.
