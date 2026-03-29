import { instance } from '@viz-js/viz';
import type { RenderedTypstSnippet } from '@eggplant-shared/typstCore';

let vizPromise: Promise<Awaited<ReturnType<typeof instance>>> | undefined;

async function viz() {
  if (!vizPromise) {
    vizPromise = instance();
  }
  return vizPromise;
}

function normalizeTypstLabelText(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length >= 4) {
    return trimmed.slice(2, -2).trim();
  }
  if (trimmed.startsWith('$') && trimmed.endsWith('$') && trimmed.length >= 2) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function parseSvgDimension(svgMarkup: string, attr: 'width' | 'height'): number {
  const match = svgMarkup.match(new RegExp(`${attr}="([0-9.]+)(?:pt)?"`));
  return match ? Number(match[1]) : 0;
}

function findNodeShape(nodeGroup: Element): SVGGraphicsElement | null {
  return (
    (Array.from(nodeGroup.children).find((child) => {
      return child.tagName !== 'title' && child.tagName !== 'text' && child.tagName !== 'image' && child.tagName !== 'svg';
    }) as SVGGraphicsElement | undefined) ?? null
  );
}

function createInlineTypstSvg(
  doc: XMLDocument,
  renderedSvgMarkup: string,
  x: number,
  y: number,
  width: number,
  height: number,
): SVGElement | null {
  const renderedDoc = new DOMParser().parseFromString(renderedSvgMarkup, 'image/svg+xml');
  const renderedRoot = renderedDoc.documentElement;
  if (!renderedRoot || renderedRoot.tagName.toLowerCase() !== 'svg') {
    return null;
  }

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

  for (const child of Array.from(renderedRoot.childNodes)) {
    nestedSvg.appendChild(doc.importNode(child, true));
  }

  return nestedSvg;
}

function applyTypstRenderingsToSvg(
  root: SVGElement,
  typstRenderings: Record<string, RenderedTypstSnippet>,
  typstSources: Record<string, string>,
): void {
  const host = document.createElement('div');
  host.style.position = 'absolute';
  host.style.left = '-10000px';
  host.style.top = '-10000px';
  host.style.visibility = 'hidden';
  host.style.pointerEvents = 'none';
  host.appendChild(root);
  document.body.appendChild(host);

  try {
    for (const nodeGroup of Array.from(root.querySelectorAll('g.node'))) {
      const title = nodeGroup.querySelector('title')?.textContent ?? '';
      const textNodes = Array.from(nodeGroup.querySelectorAll('text'));
      if (textNodes.length === 0) {
        continue;
      }

      const source = typstSources[title];
      const rendered = typstRenderings[title];
      if (!rendered) {
        if (source) {
          textNodes[0].textContent = normalizeTypstLabelText(source);
        }
        for (const textNode of textNodes) {
          textNode.textContent = normalizeTypstLabelText(textNode.textContent ?? '');
        }
        continue;
      }

      const shape = findNodeShape(nodeGroup);
      if (!shape) {
        continue;
      }

      const textLines = textNodes
        .map((node) => node.textContent?.trim() || '')
        .filter((line) => line.length > 0)
        .map((line) => normalizeTypstLabelText(line));
      const annotationLines = textLines.slice(1);
      const bbox = shape.getBBox();
      const formulaWidth = rendered.width || parseSvgDimension(rendered.svg, 'width');
      const formulaHeight = rendered.height || parseSvgDimension(rendered.svg, 'height');
      if (!formulaWidth || !formulaHeight) {
        continue;
      }

      const annotationLineHeight = 12;
      const annotationGap = annotationLines.length > 0 ? 4 : 0;
      const annotationBlockHeight = annotationLines.length * annotationLineHeight + annotationGap;
      const maxWidth = bbox.width * 0.92;
      const maxHeight = bbox.height * 0.86 - annotationBlockHeight;
      if (maxWidth <= 0 || maxHeight <= 0) {
        continue;
      }

      const scale = Math.min(maxWidth / formulaWidth, maxHeight / formulaHeight);
      if (!Number.isFinite(scale) || scale <= 0) {
        continue;
      }

      const width = formulaWidth * scale;
      const height = formulaHeight * scale;
      const contentTop = bbox.y + (bbox.height - (height + annotationBlockHeight)) / 2;
      const inlineSvg = createInlineTypstSvg(
        root.ownerDocument,
        rendered.svg,
        bbox.x + (bbox.width - width) / 2,
        contentTop,
        width,
        height,
      );
      if (!inlineSvg) {
        continue;
      }

      const annotationOverlay = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'g');
      annotationOverlay.setAttribute('data-typst-annotation-overlay', 'true');
      annotationOverlay.setAttribute('pointer-events', 'none');
      for (let index = 0; index < annotationLines.length; index += 1) {
        const line = annotationLines[index];
        const text = root.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text');
        text.setAttribute('x', String(bbox.x + bbox.width / 2));
        text.setAttribute('y', String(contentTop + height + annotationGap + (index + 1) * annotationLineHeight - 2));
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '10');
        text.setAttribute('fill', '#0f1720');
        text.setAttribute('stroke', '#ffffff');
        text.setAttribute('stroke-width', '0.8');
        text.setAttribute('paint-order', 'stroke');
        text.textContent = line;
        annotationOverlay.appendChild(text);
      }

      for (const textNode of textNodes) {
        textNode.remove();
      }
      nodeGroup.appendChild(inlineSvg);
      if (annotationLines.length > 0) {
        nodeGroup.appendChild(annotationOverlay);
      }
    }
  } finally {
    host.remove();
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
  applyTypstRenderingsToSvg(root, typstRenderings, typstSources);
  return new XMLSerializer().serializeToString(root);
}
