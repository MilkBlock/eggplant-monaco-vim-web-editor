import { $typst } from '@myriaddreamin/typst.ts';
import { setImportWasmModule as setRendererWasmModule } from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import { setImportWasmModule as setCompilerWasmModule } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';
import {
  buildTypstMathDocument,
  parseTypstSvgDimension,
  RenderedTypstSnippet,
  TypstSnippetRenderer,
} from '@eggplant-shared/typstCore';
import { buildMathRenderSources } from './typstNormalization';

const successfulRenderCache = new Map<string, RenderedTypstSnippet>();
const inFlightRenderCache = new Map<string, Promise<RenderedTypstSnippet>>();
let wasmImporterConfigured = false;
const RENDER_TIMEOUT_MS = 30000;

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
    return withTimeout(
      $typst.svg({
        mainContent: document,
      }),
      'typst render',
    );
  },
};

export async function renderWebTypstSnippets(
  sources: Array<{ targetId: string; source: string }>,
): Promise<Record<string, RenderedTypstSnippet>> {
  const result: Record<string, RenderedTypstSnippet> = {};
  for (const { targetId, source } of sources) {
    const rendered = await renderTypstSource(source);
    result[targetId] = rendered;
  }
  return result;
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

async function renderTypstSource(source: string): Promise<RenderedTypstSnippet> {
  const cached = successfulRenderCache.get(source);
  if (cached) {
    return cached;
  }

  const inFlight = inFlightRenderCache.get(source);
  if (inFlight) {
    return inFlight;
  }

  const promise = renderMathSnippet(source).finally(() => {
    inFlightRenderCache.delete(source);
  });

  inFlightRenderCache.set(source, promise);
  return promise;
}

async function renderMathSnippet(source: string): Promise<RenderedTypstSnippet> {
  ensureWasmImporter();
  const attempts = buildMathRenderSources(source);
  for (const candidate of attempts) {
    try {
      const svg = await withTimeout(webTypstRenderer.render(buildTypstMathDocument(candidate)), 'typst math render');
      const rendered: RenderedTypstSnippet = {
        svg,
        width: parseTypstSvgDimension(svg, 'width'),
        height: parseTypstSvgDimension(svg, 'height'),
        mode: 'math',
      };
      successfulRenderCache.set(source, rendered);
      return rendered;
    } catch {
      // Try the next candidate if normalization is available.
    }
  }

  console.warn('Eggplant web typst math render failed after raw + normalized attempts; using text fallback.');
  const rendered: RenderedTypstSnippet = {
    svg: '',
    width: 0,
    height: 0,
    mode: 'text-fallback',
  };
  successfulRenderCache.set(source, rendered);
  return rendered;
}
