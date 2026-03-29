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
const RENDER_TIMEOUT_MS = 4000;

function applyTypstSvgTheme(svg: string): string {
  return svg.replace(
    /<svg\b([^>]*?)>/,
    (_match, attrs: string) => {
      const styleMatch = attrs.match(/\sstyle="([^"]*)"/);
      const themedStyle = '--glyph_fill:#0f1720;--glyph_stroke:transparent;';
      if (styleMatch) {
        const merged = `${styleMatch[1]};${themedStyle}`;
        return `<svg${attrs.replace(styleMatch[0], ` style="${merged}"`)}>`;
      }
      return `<svg${attrs} style="${themedStyle}">`;
    },
  );
}

function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${RENDER_TIMEOUT_MS}ms`));
    }, RENDER_TIMEOUT_MS);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

const webTypstRenderer: TypstSnippetRenderer = {
  async render(document: string): Promise<string> {
    ensureWasmImporter();
    const svg = await withTimeout(
      $typst.svg({
        mainContent: document,
      }),
      'typst render',
    );
    return applyTypstSvgTheme(svg);
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
