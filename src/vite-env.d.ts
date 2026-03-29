/// <reference types="vite/client" />

declare module '*.rs?raw' {
  const content: string;
  export default content;
}

declare module '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs' {
  export function setImportWasmModule(
    importer: (wasmName: string, url: string) => Promise<Response | URL | string>,
  ): void;
}

declare module '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs' {
  export function setImportWasmModule(
    importer: (wasmName: string, url: string) => Promise<Response | URL | string>,
  ): void;
}
