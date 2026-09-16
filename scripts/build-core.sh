#!/usr/bin/env bash
# Builds the Rust core as an XCFramework for iOS device, iOS Simulator and
# macOS, and generates the UniFFI Swift bindings into apple/Sources.
#
# Without full Xcode (Command Line Tools only) there is no iOS SDK, so the
# iOS device/simulator builds are verified with `cargo check` instead and the
# xcframework packaging step is skipped with a notice.
set -euo pipefail
cd "$(dirname "$0")/.."

CRATE=hemlixfocus_core
LIB=libhemlixfocus_core.a
OUT=apple/Frameworks
GEN=apple/Sources

HAS_XCODE=0
if xcodebuild -version >/dev/null 2>&1; then
    HAS_XCODE=1
fi

echo "==> Building Rust core (macOS)"
cargo build -p "$CRATE" --release --target aarch64-apple-darwin

if [ "$HAS_XCODE" = 1 ]; then
    echo "==> Building Rust core (iOS device + simulator)"
    cargo build -p "$CRATE" --release --target aarch64-apple-ios
    cargo build -p "$CRATE" --release --target aarch64-apple-ios-sim
else
    echo "==> Xcode not found: verifying iOS targets with cargo check"
    cargo check -p "$CRATE" --target aarch64-apple-ios
    cargo check -p "$CRATE" --target aarch64-apple-ios-sim
fi

echo "==> Generating UniFFI Swift bindings"
rm -rf target/uniffi-gen
cargo run -q -p uniffi-bindgen -- generate \
    --library "target/aarch64-apple-darwin/release/libhemlixfocus_core.dylib" \
    --language swift \
    --out-dir target/uniffi-gen \
    --config core/uniffi.toml
mkdir -p "$GEN/HemlixFocusCore" "$GEN/HemlixFocusCoreFFI/include"
cp target/uniffi-gen/HemlixFocusCore.swift "$GEN/HemlixFocusCore/"
cp target/uniffi-gen/HemlixFocusCoreFFI.h "$GEN/HemlixFocusCoreFFI/include/"
cp target/uniffi-gen/HemlixFocusCoreFFI.modulemap "$GEN/HemlixFocusCoreFFI/include/module.modulemap"

if [ "$HAS_XCODE" = 1 ]; then
    echo "==> Packaging HemlixFocusCoreFFI.xcframework"
    mkdir -p "$OUT"
    rm -rf "$OUT/HemlixFocusCoreFFI.xcframework"
    xcodebuild -create-xcframework \
        -library "target/aarch64-apple-ios/release/$LIB" -headers "$GEN/HemlixFocusCoreFFI/include" \
        -library "target/aarch64-apple-ios-sim/release/$LIB" -headers "$GEN/HemlixFocusCoreFFI/include" \
        -library "target/aarch64-apple-darwin/release/$LIB" -headers "$GEN/HemlixFocusCoreFFI/include" \
        -output "$OUT/HemlixFocusCoreFFI.xcframework"
    echo "==> Done. Next: cd apple && xcodegen && open HemlixFocus.xcodeproj"
else
    echo "!! Skipped xcframework packaging (requires full Xcode)."
    echo "   On a Mac with Xcode: re-run scripts/build-core.sh, then"
    echo "   cd apple && xcodegen && open HemlixFocus.xcodeproj"
fi
