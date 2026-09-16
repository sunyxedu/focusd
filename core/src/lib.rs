//! Core: the complete Focusd data model and behaviour (availability,
//! blocking, next actions, perspectives, repeats, review, natural-language
//! dates, undo, persistence). Shells (Tauri desktop/mobile, wasm web) are
//! thin layers over [`Store`] via the JSON [`bridge`].

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

