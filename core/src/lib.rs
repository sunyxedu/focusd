//! Core: the complete Focusd data model and behaviour (availability,
//! blocking, next actions, perspectives, repeats, review, natural-language
//! dates, undo, persistence). Shells (Tauri desktop/mobile, wasm web) are
//! thin layers over [`Store`] via the JSON [`bridge`].
//!
//! No `unsafe` anywhere in this crate. The only exception is the `wasm`
//! module, where the `#[wasm_bindgen]` macro expansion itself contains
//! `unsafe` FFI glue we do not write; that module opts out locally.
#![deny(unsafe_code)]
// The JSON bridge passes unit results through `ok(...)` on purpose; row
// enums intentionally carry full records.
#![allow(clippy::unit_arg, clippy::large_enum_variant, clippy::too_many_arguments, clippy::only_used_in_recursion)]

pub mod bridge;
pub mod dates;
pub mod derive;
pub mod model;
pub mod repeat;
pub mod rows;
pub mod seed;
pub mod store;
#[cfg(feature = "wasm")]
pub mod wasm;

pub use model::*;
pub use rows::*;
pub use store::*;
pub use bridge::*;

