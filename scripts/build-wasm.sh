#!/usr/bin/env bash
# Builds the Rust core to WebAssembly and generates the JS glue into app/wasm.
# Requires: rustup target add wasm32-unknown-unknown; cargo install wasm-bindgen-cli
set -euo pipefail
cd "$(dirname "$0")/.."
cargo build -p focusd_core --release --target wasm32-unknown-unknown --features wasm
wasm-bindgen target/wasm32-unknown-unknown/release/focusd_core.wasm \
  --target web --out-dir app/wasm --out-name focusd_core
if command -v wasm-opt >/dev/null 2>&1; then
  wasm-opt -Oz -o app/wasm/focusd_core_bg.wasm app/wasm/focusd_core_bg.wasm
fi
ls -la app/wasm/
