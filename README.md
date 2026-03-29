# Eggplant Pattern Web Editor

A minimal browser-based Rust editor spike for the Eggplant pattern preview workflow.

## What it includes

- Monaco Editor
- Vim keybindings via `monaco-vim`
- Bundled real sample `.rs` files from the plugin repo
- GitHub Pages deployment via Actions

## Local development

```bash
npm install
npm run dev
```

## Production build

```bash
npm run build
```

## Rebuild browser extractor wasm

The browser extractor bundle under `src/vendor/extractor-wasm` is built from
`eggplant-pattern-extractor` using `cdylib` and `no_salsa_async_drops` so
`ra_ap_syntax` does not panic on `wasm32` drop paths.

```bash
cd ../eggplant_pattern_view_plugin/eggplant-pattern-extractor
RUSTFLAGS='--cfg no_salsa_async_drops' cargo rustc --lib --target wasm32-unknown-unknown --release --crate-type cdylib
wasm-bindgen target/wasm32-unknown-unknown/release/eggplant_pattern_extractor.wasm \
  --out-dir /tmp/eggplant-extractor-bindgen \
  --target web
cp /tmp/eggplant-extractor-bindgen/* ../../eggplant-pattern-web-editor/src/vendor/extractor-wasm/
```
