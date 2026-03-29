import { instance } from '@viz-js/viz';
import {
  displayTextFallbackSource,
  normalizeTypstMathSource,
  type RenderedTypstSnippet,
} from '@eggplant-shared/typstCore';

let vizPromise: Promise<Awaited<ReturnType<typeof instance>>> | undefined;

async function viz() {
  if (!vizPromise) {
    vizPromise = instance();
  }
  return vizPromise;
}

function normalizeTypstLabelText(text: string): string {
  return displayTextFallbackSource(normalizeTypstMathSource(text)).trim();
}

function setNodeTextContent(textNodes: SVGTextElement[], source: string): void {
  const lines = normalizeTypstLabelText(source)
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    return;
  }

  textNodes.forEach((textNode, index) => {
    textNode.textContent = lines[index] ?? '';
  });
}

function sanitizeNodeLabels(svgMarkup: string, typstSources: Record<string, string>): string {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const root = doc.documentElement;

  for (const nodeGroup of Array.from(root.querySelectorAll('g.node'))) {
    const title = nodeGroup.querySelector('title')?.textContent ?? '';
    const textNodes = Array.from(nodeGroup.querySelectorAll('text'));
    if (textNodes.length === 0) {
      continue;
    }

    const source = typstSources[title];
    if (source) {
      setNodeTextContent(textNodes, source);
    }
  }

  for (const textNode of Array.from(root.querySelectorAll('text'))) {
    const current = textNode.textContent ?? '';
    textNode.textContent = normalizeTypstLabelText(current);
  }

  return new XMLSerializer().serializeToString(root);
}

export async function renderDotToSvg(
  dot: string,
  _typstRenderings: Record<string, RenderedTypstSnippet> = {},
  typstSources: Record<string, string> = {},
): Promise<string> {
  const renderer = await viz();
  const svgMarkup = renderer.renderString(dot, {
    format: 'svg',
    engine: 'dot',
  });
  return sanitizeNodeLabels(svgMarkup, typstSources);
}
