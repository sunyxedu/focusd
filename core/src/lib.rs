//! HemlixFocus core: the complete Focusd data model and behaviour
//! (availability, blocking, next actions, perspectives, repeats, review,
//! natural-language dates, undo, persistence). The Apple app is a thin
//! SwiftUI shell over the [`Store`] object exported through UniFFI.

pub mod dates;
pub mod derive;
pub mod model;
pub mod repeat;
pub mod rows;
pub mod seed;
pub mod store;

pub use model::*;
pub use rows::*;
pub use store::*;

uniffi::setup_scaffolding!();
