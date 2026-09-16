//! wasm-bindgen shell for the web build. The store lives in memory; the
//! page persists `exportJson` output (IndexedDB / localStorage) and feeds it
//! back through `importJson` on load.
// `#[wasm_bindgen]` expands to `unsafe extern` glue; none of the hand-written
// code here is unsafe.
#![allow(unsafe_code)]
use crate::bridge::dispatch;
use crate::store::Store;
use std::sync::Arc;
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub struct WasmStore {
    store: Arc<Store>,
}

#[wasm_bindgen]
impl WasmStore {
    /// `seed` = tutorial content; pass `saved` JSON to restore a database.
    #[wasm_bindgen(constructor)]
    pub fn new(seed: bool, saved: Option<String>) -> WasmStore {
        let store = Store::in_memory(seed);
        if let Some(text) = saved {
            let _ = store.import_json(text);
        }
        WasmStore { store }
    }

    /// Call any core method. `args` is a JSON object string; returns JSON.
    pub fn call(&self, method: &str, args: &str) -> Result<String, JsValue> {
        let args: serde_json::Value = if args.is_empty() { serde_json::json!({}) } else { serde_json::from_str(args).map_err(|e| JsValue::from_str(&e.to_string()))? };
        let out = dispatch(&self.store, method, &args).map_err(|e| JsValue::from_str(&e))?;
        serde_json::to_string(&out).map_err(|e| JsValue::from_str(&e.to_string()))
    }

    pub fn revision(&self) -> f64 {
        self.store.revision() as f64
    }
}
