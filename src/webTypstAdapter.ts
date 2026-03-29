import { $typst } from '@myriaddreamin/typst.ts';
import { setImportWasmModule as setRendererWasmModule } from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import { setImportWasmModule as setCompilerWasmModule } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import {
  RenderedTypstSnippet,
  TypstSnippetRenderer,
  renderTypstSnippetsWithRenderer,
} from '@eggplant-shared/typstCore';

const renderCache = new Map<string, Promise<RenderedTypstSnippet | null>>();
let wasmImporterConfigured = false;

const webTypstRenderer: TypstSnippetRenderer = {
  async render(document: string): Promise<string> {
    ensureWasmImporter();
    return $typst.svg({
      mainContent: document,
    });
  },
};

export async function renderWebTypstSnippets(
  sources: Array<{ targetId: string; source: string }>,
): Promise<Record<string, RenderedTypstSnippet>> {
  return renderTypstSnippetsWithRenderer(
    sources,
    webTypstRenderer,
    renderCache,
    (error) => {
      console.warn('Eggplant web typst render failed', error);
    },
  );
}

function ensureWasmImporter(): void {
  if (wasmImporterConfigured) {
    return;
  }

  const importWasmModule = async (wasmName: string) => {
    if (wasmName.includes('renderer')) {
      return fetch(rendererWasmUrl);
    }
    if (wasmName.includes('compiler')) {
      return fetch(compilerWasmUrl);
    }
    throw new Error(`Unknown wasm module: ${wasmName}`);
  };

  setRendererWasmModule(importWasmModule);
  setCompilerWasmModule(importWasmModule);
  wasmImporterConfigured = true;
}
