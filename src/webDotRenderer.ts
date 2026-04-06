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

  return {
    x: Math.min(...xs),
    y: Math.min(...ys),
    width: Math.max(...xs) - Math.min(...xs),
    height: Math.max(...ys) - Math.min(...ys),
  };
}

function numberAttr(node: Element, name: string, fallback = Number.NaN): number {
  const value = node.getAttribute(name);
  return value === null ? fallback : Number(value);
}

function extractNodeBounds(nodeGroup: Element): NodeBounds | null {
  const shape = Array.from(nodeGroup.children).find((child) =>
    ['ellipse', 'polygon', 'rect', 'path'].includes(child.tagName.toLowerCase()),
  );
  if (!shape) {
    return null;
  }

  if (shape.tagName.toLowerCase() === 'polygon') {
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

  if (shape.tagName.toLowerCase() === 'ellipse') {
    const cx = numberAttr(shape, 'cx');
    const cy = numberAttr(shape, 'cy');
    const rx = numberAttr(shape, 'rx');
    const ry = numberAttr(shape, 'ry');
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

  if (shape.tagName.toLowerCase() === 'rect') {
    const x = numberAttr(shape, 'x', 0);
    const y = numberAttr(shape, 'y', 0);
    const width = numberAttr(shape, 'width');
    const height = numberAttr(shape, 'height');
    if (![x, y, width, height].every(Number.isFinite)) {
      return null;
    }
    return { x, y, width, height };
  }

  if (shape.tagName.toLowerCase() === 'path') {
    return parsePathBounds(shape.getAttribute('d') ?? '');
  }

  return null;
}

function createInlineTypstSvg(
  doc: XMLDocument,
  rendered: RenderedTypstSnippet,
  bounds: NodeBounds,
): SVGElement | null {
  const tempGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
  tempGroup.innerHTML = rendered.svg.trim();
  const renderedRoot = tempGroup.firstElementChild;
  if (!renderedRoot || renderedRoot.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  const formulaWidth = rendered.width || parseSvgDimension(rendered.svg, 'width');
  const formulaHeight = rendered.height || parseSvgDimension(rendered.svg, 'height');
  if (!formulaWidth || !formulaHeight) {
    return null;
  }

  if (bounds.width <= 0 || bounds.height <= 0) {
    return null;
  }

  const scale = Math.min(bounds.width / formulaWidth, bounds.height / formulaHeight);
  if (!Number.isFinite(scale) || scale <= 0) {
    return null;
  }

  const nestedSvg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
  nestedSvg.setAttribute('x', String(bounds.x));
  nestedSvg.setAttribute('y', String(bounds.y));
  nestedSvg.setAttribute('width', String(bounds.width));
  nestedSvg.setAttribute('height', String(bounds.height));
  nestedSvg.setAttribute('overflow', 'hidden');
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

function collectNodeTextNodes(nodeGroup: Element): SVGTextElement[] {
  return Array.from(nodeGroup.children).filter(
    (node): node is SVGTextElement => node.tagName.toLowerCase() === 'text',
  );
}

function applyNodeRenderings(
  root: SVGElement,
  typstRenderings: Record<string, RenderedTypstSnippet>,
  typstSources: Record<string, string>,
): number {
  let overlayCount = 0;
  for (const nodeGroup of Array.from(root.querySelectorAll('g.node'))) {
    const title = nodeGroup.querySelector('title')?.textContent ?? '';
    for (const imageNode of Array.from(nodeGroup.children).filter(
      (node) => node.tagName.toLowerCase() === 'image',
    )) {
      imageNode.remove();
    }

    const textNodes = collectNodeTextNodes(nodeGroup);
    if (textNodes.length === 0) {
      continue;
    }

    const source = typstSources[title];
    const rendered = typstRenderings[title];
    if (!source || !rendered || rendered.mode !== 'math') {
      continue;
    }

    const bounds = extractNodeBounds(nodeGroup);
    const overlay = bounds ? createInlineTypstSvg(root.ownerDocument, rendered, bounds) : null;
    if (!overlay) {
      continue;
    }

    for (const textNode of textNodes) {
      textNode.remove();
    }
    nodeGroup.appendChild(overlay);
    overlayCount += 1;
  }
  return overlayCount;
}

function sanitizeGraphvizText(root: SVGElement): void {
  for (const selector of ['g.edge > text', 'g.cluster > text', 'g.node > text']) {
    for (const textNode of Array.from(root.querySelectorAll(selector)).filter(
      (node): node is SVGTextElement => node.tagName.toLowerCase() === 'text',
    )) {
      const current = textNode.textContent ?? '';
      textNode.textContent = normalizeTypstLabelText(current);
    }
  }
}

function applyHighlightedNodeBorders(root: SVGElement, highlightedNodeIds: string[]): void {
  const highlighted = new Set(highlightedNodeIds);
  if (highlighted.size === 0) {
    return;
  }

  for (const nodeGroup of Array.from(root.querySelectorAll('g.node'))) {
    const title = nodeGroup.querySelector('title')?.textContent?.trim() ?? '';
    if (!highlighted.has(title)) {
      continue;
    }

    for (const shape of Array.from(nodeGroup.children).filter((node) =>
      ['ellipse', 'polygon', 'rect', 'path'].includes(node.tagName.toLowerCase()),
    )) {
      shape.setAttribute('stroke-width', '3');
    }
  }
}

export async function renderDotToSvg(
  dot: string,
  typstRenderings: Record<string, RenderedTypstSnippet> = {},
  typstSources: Record<string, string> = {},
  highlightedNodeIds: string[] = [],
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
  applyHighlightedNodeBorders(root, highlightedNodeIds);
  sanitizeGraphvizText(root);
  return new XMLSerializer().serializeToString(root);
}
