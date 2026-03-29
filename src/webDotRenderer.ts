import { instance } from '@viz-js/viz';
import {
  displayTextFallbackSource,
  normalizeTypstMathSource,
  type RenderedTypstSnippet,
} from '@eggplant-shared/typstCore';

let vizPromise: Promise<Awaited<ReturnType<typeof instance>>> | undefined;

type NodeBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

async function viz() {
  if (!vizPromise) {
    vizPromise = instance();
  }
  return vizPromise;
}

function normalizeTypstLabelText(text: string): string {
  return displayTextFallbackSource(normalizeTypstMathSource(text))
    .replace(/\$\$/g, ' ')
    .replace(/\$/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseSvgDimension(svgMarkup: string, attr: 'width' | 'height'): number {
  const match = svgMarkup.match(new RegExp(`${attr}="([0-9.]+)(?:pt)?"`));
  return match ? Number(match[1]) : 0;
}

function parsePointList(points: string): Array<{ x: number; y: number }> {
  return points
    .trim()
    .split(/\s+/)
    .map((entry) => {
      const [x, y] = entry.split(',').map(Number);
      return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null;
    })
    .filter((point): point is { x: number; y: number } => point !== null);
}

function parsePathBounds(pathData: string): NodeBounds | null {
  const numbers = Array.from(pathData.matchAll(/-?\d*\.?\d+/g), (match) => Number(match[0])).filter(Number.isFinite);
  if (numbers.length < 4) {
    return null;
  }

  const xs: number[] = [];
  const ys: number[] = [];
  for (let index = 0; index + 1 < numbers.length; index += 2) {
    xs.push(numbers[index]);
    ys.push(numbers[index + 1]);
  }

  if (xs.length === 0 || ys.length === 0) {
    return null;
  }

  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function extractNodeBounds(nodeGroup: Element): NodeBounds | null {
  const shape = Array.from(nodeGroup.children).find((child) =>
    ['ellipse', 'polygon', 'rect', 'path'].includes(child.tagName.toLowerCase()),
  );
  if (!shape) {
    return null;
  }

  if (shape instanceof SVGPolygonElement) {
    const points = parsePointList(shape.getAttribute('points') ?? '');
    if (points.length === 0) {
      return null;
    }

    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return {
      x: Math.min(...xs),
      y: Math.min(...ys),
      width: Math.max(...xs) - Math.min(...xs),
      height: Math.max(...ys) - Math.min(...ys),
    };
  }

  if (shape instanceof SVGEllipseElement) {
    const cx = Number(shape.getAttribute('cx'));
    const cy = Number(shape.getAttribute('cy'));
    const rx = Number(shape.getAttribute('rx'));
    const ry = Number(shape.getAttribute('ry'));
    if (![cx, cy, rx, ry].every(Number.isFinite)) {
      return null;
    }

    return {
      x: cx - rx,
      y: cy - ry,
      width: rx * 2,
      height: ry * 2,
    };
  }

  if (shape instanceof SVGRectElement) {
    const x = Number(shape.getAttribute('x') ?? '0');
    const y = Number(shape.getAttribute('y') ?? '0');
    const width = Number(shape.getAttribute('width'));
    const height = Number(shape.getAttribute('height'));
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }
    return { x, y, width, height };
  }

  if (shape instanceof SVGPathElement) {
    return parsePathBounds(shape.getAttribute('d') ?? '');
  }

  return null;
}

function createInlineTypstSvg(
  doc: XMLDocument,
  rendered: RenderedTypstSnippet,
  bounds: NodeBounds,
): SVGElement | null {
  const renderedDoc = new DOMParser().parseFromString(rendered.svg, 'image/svg+xml');
  const renderedRoot = renderedDoc.documentElement;
  if (!renderedRoot || renderedRoot.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  const formulaWidth = rendered.width || parseSvgDimension(rendered.svg, 'width');
  const formulaHeight = rendered.height || parseSvgDimension(rendered.svg, 'height');
  if (!formulaWidth || !formulaHeight) {
    return null;
  }

  const maxWidth = bounds.width * 0.84;
  const maxHeight = bounds.height * 0.72;
  if (maxWidth <= 0 || maxHeight <= 0) {
    return null;
  }

  const scale = Math.min(maxWidth / formulaWidth, maxHeight / formulaHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const width = formulaWidth * scale;
  const height = formulaHeight * scale;
  const x = bounds.x + (bounds.width - width) / 2;
  const y = bounds.y + (bounds.height - height) / 2;

  const nestedSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  nestedSvg.setAttribute('x', String(x));
  nestedSvg.setAttribute('y', String(y));
  nestedSvg.setAttribute('width', String(width));
  nestedSvg.setAttribute('height', String(height));
  nestedSvg.setAttribute('overflow', 'visible');
  nestedSvg.setAttribute('pointer-events', 'none');
  nestedSvg.setAttribute('data-typst-rendering', 'true');

  const viewBox = renderedRoot.getAttribute('viewBox');
  if (viewBox) {
    nestedSvg.setAttribute('viewBox', viewBox);
    nestedSvg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  }

  const style = renderedRoot.getAttribute('style');
  if (style) {
    nestedSvg.setAttribute('style', style);
  }

  for (const child of Array.from(renderedRoot.childNodes)) {
    nestedSvg.appendChild(doc.importNode(child, true));
  }

  return nestedSvg;
}

function setFallbackNodeText(textNodes: SVGTextElement[], source: string): void {
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

function applyNodeRenderings(
  root: SVGElement,
  typstRenderings: Record<string, RenderedTypstSnippet>,
  typstSources: Record<string, string>,
): void {
  for (const nodeGroup of Array.from(root.querySelectorAll('g.node'))) {
    const title = nodeGroup.querySelector('title')?.textContent ?? '';
    const textNodes = Array.from(nodeGroup.querySelectorAll(':scope > text')).filter(
      (node): node is SVGTextElement => node instanceof SVGTextElement,
    );
    if (textNodes.length === 0) {
      continue;
    }

    const source = typstSources[title];
    const rendered = typstRenderings[title];
    if (!source || !rendered || rendered.mode !== 'math') {
      if (source) {
        setFallbackNodeText(textNodes, source);
      }
      continue;
    }

    const bounds = extractNodeBounds(nodeGroup);
    const overlay = bounds ? createInlineTypstSvg(root.ownerDocument, rendered, bounds) : null;
    if (!overlay) {
      setFallbackNodeText(textNodes, source);
      continue;
    }

    for (const textNode of textNodes) {
      textNode.remove();
    }
    nodeGroup.appendChild(overlay);
  }
}

function sanitizeGraphvizText(root: SVGElement): void {
  for (const selector of ['g.edge > text', 'g.cluster > text', 'g.node > text']) {
    for (const textNode of Array.from(root.querySelectorAll(selector)).filter(
      (node): node is SVGTextElement => node instanceof SVGTextElement,
    )) {
      const current = textNode.textContent ?? '';
      textNode.textContent = normalizeTypstLabelText(current);
    }
  }
}

export async function renderDotToSvg(
  dot: string,
  typstRenderings: Record<string, RenderedTypstSnippet> = {},
  typstSources: Record<string, string> = {},
): Promise<string> {
  const renderer = await viz();
  const svgMarkup = renderer.renderString(dot, {
    format: 'svg',
    engine: 'dot',
  });
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');
  const root = doc.documentElement as unknown as SVGElement;
  applyNodeRenderings(root, typstRenderings, typstSources);
  sanitizeGraphvizText(root);
  return new XMLSerializer().serializeToString(root);
}
