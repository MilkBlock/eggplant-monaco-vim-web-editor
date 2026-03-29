import { $typst } from '@myriaddreamin/typst.ts';
import { setImportWasmModule as setRendererWasmModule } from '@myriaddreamin/typst-ts-renderer/pkg/typst_ts_renderer.mjs';
import { setImportWasmModule as setCompilerWasmModule } from '@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler.mjs';
import rendererWasmUrl from '@myriaddreamin/typst-ts-renderer/wasm?url';
import compilerWasmUrl from '@myriaddreamin/typst-ts-web-compiler/wasm?url';

export type TypstSpikeSnippet = {
  id: string;
  label: string;
  source: string;
};

export type TypstSpikeResult = {
  id: string;
  label: string;
  source: string;
  svg: string | null;
  mode: 'math' | 'text-fallback' | 'failed';
  elapsedMs: number;
  error?: string;
};

export const spikeSnippets: TypstSpikeSnippet[] = [
  {
    id: 'fib',
    label: 'Function label',
    source: 'fib(x)',
  },
  {
    id: 'diff',
    label: 'DisplayMath template',
    source: 'diff x, f',
  },
  {
    id: 'pow',
    label: 'Node label',
    source: 'x^2 + y^2',
  },
  {
    id: 'integral',
    label: 'Integral template',
    source: 'integral f, x',
  },
];

const renderCache = new Map<string, Promise<TypstSpikeResult>>();
let wasmImporterConfigured = false;

export function normalizeTypstMathSource(source: string): string {
  const trimmed = source.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function buildMathDocument(source: string): string {
  return [
    '#set page(width: auto, height: auto, margin: 0pt)',
    '#set par(justify: false)',
    `#box(inset: (x: 1.2pt, y: 1.6pt))[$ ${normalizeTypstMathSource(source)} $]`,
  ].join('\n');
}

function buildTextDocument(source: string): string {
  return [
    '#set page(width: auto, height: auto, margin: 0pt)',
    '#set par(justify: false)',
    `#box(inset: (x: 1.2pt, y: 1.6pt))[${JSON.stringify(source)}]`,
  ].join('\n');
}

async function renderSvg(document: string): Promise<string> {
  ensureWasmImporter();
  return $typst.svg({
    mainContent: document,
  });
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

export async function renderTypstSpikeSnippet(
  snippet: TypstSpikeSnippet,
): Promise<TypstSpikeResult> {
  if (!renderCache.has(snippet.id)) {
    renderCache.set(
      snippet.id,
      (async () => {
        const startedAt = performance.now();
        try {
          const svg = await renderSvg(buildMathDocument(snippet.source));
          return {
            id: snippet.id,
            label: snippet.label,
            source: snippet.source,
            svg,
            mode: 'math',
            elapsedMs: performance.now() - startedAt,
          };
        } catch (mathError) {
          try {
            const svg = await renderSvg(buildTextDocument(snippet.source));
            return {
              id: snippet.id,
              label: snippet.label,
              source: snippet.source,
              svg,
              mode: 'text-fallback',
              elapsedMs: performance.now() - startedAt,
            };
          } catch (textError) {
            const error =
              textError instanceof Error ? textError.message : String(textError);
            return {
              id: snippet.id,
              label: snippet.label,
              source: snippet.source,
              svg: null,
              mode: 'failed',
              elapsedMs: performance.now() - startedAt,
              error,
            };
          }
        }
      })(),
    );
  }

  return renderCache.get(snippet.id)!;
}
