import {
  startTransition,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type MouseEvent as ReactMouseEvent,
  type WheelEvent as ReactWheelEvent,
} from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { initVimMode } from 'monaco-vim';
import {
  buildConstraintCountByNodeId,
  buildConstraintEntries,
  buildMetadataSourcesView,
  buildPreviewPanelState,
  collectSourceTargetIds,
  createDefaultPreviewInteractionState,
  drilldownConstraintNode,
  modeLabel,
  projectPreviewInteractionState,
  selectConstraint,
  selectRuleCheck,
  setConstraintFilterMode,
  toggleRuleCheckView,
  type PreviewConstraintEntry,
  type PreviewInteractionState,
} from '@eggplant-shared/previewCore';
import type { PatternIr } from '@eggplant-vscode/ir';
import {
  collectTypstReplacementSources,
  patternIrToDotWithMode,
  type DotLabelStyle,
  type DotViewMode,
} from '@eggplant-vscode/dot';
import { findRedundantActionInsertChecks } from '@eggplant-vscode/ruleChecks';
import {
  displayTextFallbackSource,
  normalizeTypstMathSource,
  type RenderedTypstSnippet,
} from '@eggplant-shared/typstCore';
import patternSamplesSource from './samples/pattern_samples.rs?raw';
import fibonacciFuncSource from './samples/fibonacci_func.rs?raw';
import relationSource from './samples/relation.rs?raw';
import mathMicrobenchmarkSource from './samples/math_microbenchmark.rs?raw';
import complexSource from './samples/complex.rs?raw';
import fibExampleSnapshotSource from './snapshot-demos/fib_example.json?raw';
import relationExampleSnapshotSource from './snapshot-demos/relation_example.json?raw';
import gblDataExampleSnapshotSource from './snapshot-demos/gbl_data_example.json?raw';
import constantPropExampleSnapshotSource from './snapshot-demos/constant_prop_example.json?raw';
import mathMicrobenchmarkSnapshotSource from './snapshot-demos/math_microbenchmark_v2.json?raw';
import v2EqclassCommonPathSnapshotSource from './snapshot-demos/v2_eqclass_common_path.json?raw';
import v2EqclassUnionSnapshotSource from './snapshot-demos/v2_eqclass_union.json?raw';
import typstMetadataExampleSnapshotSource from './snapshot-demos/typst_metadata_example.json?raw';
import commonPathBinarySnapshotUrl from './snapshot-demos/common_path.egbin?url';
import plainSourceBinarySnapshotUrl from './snapshot-demos/plain_source_non_goal.egbin?url';
import v2EqclassCommonPathBinarySnapshotUrl from './snapshot-demos/v2_eqclass_common_path.egbin?url';
import v2EqclassUnionBinarySnapshotUrl from './snapshot-demos/v2_eqclass_union.egbin?url';
import { extractPatternIr } from './webExtractor';
import { renderDotToSvg } from './webDotRenderer';
import { buildSnapshotInspectorModel, type SnapshotInspectorModel } from './snapshotInspector';
import { decodeBinaryPersistedSnapshot } from './snapshotBinary';
import { transpileEggSource } from './webTranspiler';

type SampleFile = {
  id: string;
  label: string;
  description: string;
  source: string;
};

type PreviewFixture = {
  fileName: string;
  description: string;
  dot: string;
  svg: string;
  ir: PatternIr;
  typstSources: Record<string, string>;
};

type SnapshotDemo = {
  id: string;
  label: string;
  description: string;
  format: 'json' | 'binary';
  source?: string;
  url?: string;
};

const sampleFiles: SampleFile[] = [
  {
    id: 'math_microbenchmark',
    label: 'math_microbenchmark.rs',
    description: 'High-density math sample with rich typst rendering coverage.',
    source: mathMicrobenchmarkSource,
  },
  {
    id: 'complex',
    label: 'complex.rs',
    description: 'Complex rule sample for nested pattern/action extraction.',
    source: complexSource,
  },
  {
    id: 'pattern_samples',
    label: 'pattern_samples.rs',
    description: 'Core rule and display samples from the VSCode plugin repo.',
    source: patternSamplesSource,
  },
  {
    id: 'fibonacci_func',
    label: 'fibonacci_func.rs',
    description: 'Function-table query sample with Eggplant metadata.',
    source: fibonacciFuncSource,
  },
  {
    id: 'relation',
    label: 'relation.rs',
    description: 'Relation/path sample with seed and extend rules.',
    source: relationSource,
  },
];

const snapshotDemos: SnapshotDemo[] = [
  {
    id: 'v2_eqclass_common_path',
    label: 'v2_eqclass_common_path.json',
    description: 'Eqclass-aware v2 snapshot fixture from eggplant tests: common-path profile with eq_class_payload.',
    format: 'json',
    source: v2EqclassCommonPathSnapshotSource,
  },
  {
    id: 'v2_eqclass_union',
    label: 'v2_eqclass_union.json',
    description: 'Eqclass-aware v2 snapshot fixture focused on union/class grouping behavior.',
    format: 'json',
    source: v2EqclassUnionSnapshotSource,
  },
  {
    id: 'typst_metadata_example',
    label: 'typst_metadata_example.json',
    description: 'Real v2 snapshot with constructor metadata carrying typst_template + precedence.',
    format: 'json',
    source: typstMetadataExampleSnapshotSource,
  },
  {
    id: 'math_microbenchmark_v2',
    label: 'math_microbenchmark_v2.json',
    description: 'Real v2 snapshot from math_microbenchmark using a minimal standalone driver with two rewrite passes to keep the demo interactive.',
    format: 'json',
    source: mathMicrobenchmarkSnapshotSource,
  },
  {
    id: 'fib_example',
    label: 'fib_example.json',
    description: 'Snapshot derived from the fib example: function-table rows plus rule-driven growth.',
    format: 'json',
    source: fibExampleSnapshotSource,
  },
  {
    id: 'relation_example',
    label: 'relation_example.json',
    description: 'Snapshot derived from the relation example: edge/path expansion with mark rows.',
    format: 'json',
    source: relationExampleSnapshotSource,
  },
  {
    id: 'gbl_data_example',
    label: 'gbl_data_example.json',
    description: 'Snapshot derived from the gbl_data example family: arithmetic constructor graph.',
    format: 'json',
    source: gblDataExampleSnapshotSource,
  },
  {
    id: 'constant_prop_example',
    label: 'constant_prop_example.json',
    description: 'Snapshot derived from the constant_prop example: arithmetic rewrite rows over constants.',
    format: 'json',
    source: constantPropExampleSnapshotSource,
  },
  {
    id: 'binary_v2_eqclass_common_path',
    label: 'v2_eqclass_common_path.egbin',
    description: 'Binary v2 snapshot fixture using the new MessagePack envelope format.',
    format: 'binary',
    url: v2EqclassCommonPathBinarySnapshotUrl,
  },
  {
    id: 'binary_v2_eqclass_union',
    label: 'v2_eqclass_union.egbin',
    description: 'Binary v2 snapshot fixture focused on union/class grouping behavior.',
    format: 'binary',
    url: v2EqclassUnionBinarySnapshotUrl,
  },
  {
    id: 'binary_common_path',
    label: 'common_path.egbin',
    description: 'Binary v1 snapshot fixture for the common-path baseline.',
    format: 'binary',
    url: commonPathBinarySnapshotUrl,
  },
  {
    id: 'binary_plain_source_non_goal',
    label: 'plain_source_non_goal.egbin',
    description: 'Binary v1 snapshot fixture without eq-class payload, useful for non-goal source coverage.',
    format: 'binary',
    url: plainSourceBinarySnapshotUrl,
  },
];

const rustKeywords = ['fn', 'struct', 'enum', 'impl', 'let', 'pub', 'use', 'mod', 'match', 'if', 'else', 'return'];
const utf8Encoder = new TextEncoder();
const dotViewModes: DotViewMode[] = ['pattern', 'action', 'combined'];
const defaultSampleId = 'math_microbenchmark';

type GraphContextMenuState = {
  open: boolean;
  x: number;
  y: number;
  targetId: string;
  typstSource: string;
  typstStatus: string;
  nodeConstraints: PreviewConstraintEntry[];
};

type GraphZoomState = {
  open: boolean;
  sourceMode: 'code' | 'snapshot';
  svg: string;
};

type SnapshotTypstOverlay = {
  id: string;
  nodeId: string;
  source: string;
  status: string;
  rendering: RenderedTypstSnippet | null;
  x: number;
  y: number;
  scale: number;
  color: string;
};

type MonacoEditorInstance = Parameters<OnMount>[0];

type RangeLike = {
  start: number;
  end: number;
};

type EggRuleMapping = {
  eggRuleRanges: RangeLike[];
  rustRuleCallOffsets: number[];
  generatedRust: string;
};

const closedGraphContextMenu: GraphContextMenuState = {
  open: false,
  x: 0,
  y: 0,
  targetId: '',
  typstSource: '',
  typstStatus: 'Typst: no source',
  nodeConstraints: [],
};

const closedGraphZoom: GraphZoomState = {
  open: false,
  sourceMode: 'code',
  svg: '',
};

function countKeywordHits(source: string) {
  return rustKeywords
    .map((keyword) => ({
      keyword,
      count: (source.match(new RegExp(`\\b${keyword}\\b`, 'g')) ?? []).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

function utf16OffsetToUtf8ByteOffset(source: string, utf16Offset: number): number {
  const clampedOffset = Math.max(0, Math.min(source.length, utf16Offset));
  return utf8Encoder.encode(source.slice(0, clampedOffset)).length;
}

function utf8ByteOffsetToUtf16Offset(source: string, byteOffset: number): number {
  const bytes = Math.max(0, byteOffset);
  let utf16Offset = 0;
  let consumed = 0;
  for (const char of source) {
    const next = consumed + utf8Encoder.encode(char).length;
    if (next > bytes) {
      break;
    }
    consumed = next;
    utf16Offset += char.length;
  }
  return utf16Offset;
}

function collectRuleCallOffsets(source: string): number[] {
  return Array.from(source.matchAll(/add_rule(?:_with_hook)?\s*\(/g)).map((match) => match.index ?? 0);
}

function findMatchingParenRange(source: string, startOffset: number): RangeLike | null {
  let depth = 0;
  let inString = false;
  let inComment = false;
  let escapeNext = false;

  for (let index = startOffset; index < source.length; index += 1) {
    const char = source[index];

    if (inComment) {
      if (char === '\n') {
        inComment = false;
      }
      continue;
    }

    if (inString) {
      if (escapeNext) {
        escapeNext = false;
        continue;
      }
      if (char === '\\') {
        escapeNext = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === ';') {
      inComment = true;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === '(') {
      depth += 1;
      continue;
    }
    if (char === ')') {
      depth -= 1;
      if (depth === 0) {
        return { start: startOffset, end: index + 1 };
      }
    }
  }

  return null;
}

function collectEggRuleRanges(source: string): RangeLike[] {
  const starts = Array.from(source.matchAll(/\((?:rewrite|birewrite|rule)\b/g)).map((match) => match.index ?? 0);
  return starts
    .map((start) => findMatchingParenRange(source, start))
    .filter((range): range is RangeLike => range !== null);
}

function resolveSourceSpan(ir: PatternIr, targetId: string): RangeLike | null {
  const node = ir.nodes.find((entry) => entry.id === targetId);
  if (node) {
    return node.range;
  }
  if (targetId.startsWith('constraint:')) {
    return ir.constraints.find((entry) => `constraint:${entry.id}` === targetId)?.range ?? null;
  }
  if (targetId.startsWith('effect:')) {
    return ir.action_effects.find((entry) => `effect:${entry.id}` === targetId)?.range ?? null;
  }
  if (targetId.startsWith('seed:')) {
    return ir.seed_facts.find((entry) => `seed:${entry.id}` === targetId)?.range ?? null;
  }
  return null;
}

function findRuleOrdinalAtRustOffset(offset: number, ruleOffsets: number[]): number {
  let ordinal = 0;
  for (let index = 0; index < ruleOffsets.length; index += 1) {
    if (ruleOffsets[index] <= offset) {
      ordinal = index;
    } else {
      break;
    }
  }
  return ordinal;
}

function scopeLabelFromIr(ir: PatternIr): string {
  const { kind, text_range } = ir.scope;
  return `${kind} @ ${text_range.start}-${text_range.end}`;
}

function isEmptyRuleScope(ir: PatternIr): boolean {
  return ir.nodes.length === 0 && ir.action_effects.length === 0 && ir.seed_facts.length === 0;
}

function findFirstRuleCallOffset(source: string): number | null {
  const ruleCallPattern = /(?:\b[A-Za-z_][A-Za-z0-9_]*::|\b[A-Za-z_][A-Za-z0-9_]*\.)add_rule(?:_with_hook)?\s*\(/g;
  const match = ruleCallPattern.exec(source);
  if (!match || typeof match.index !== 'number') {
    return null;
  }
  const callOffset = match[0].search(/add_rule(?:_with_hook)?\s*\(/);
  if (callOffset < 0) {
    return null;
  }
  return match.index + callOffset;
}

function buildTypstSourcesFromIr(
  ir: PatternIr,
  mode: DotViewMode = 'combined',
  labelStyle: DotLabelStyle = 'recursive',
): Record<string, string> {
  const byTargetId: Record<string, string> = {};
  for (const entry of collectTypstReplacementSources(ir, mode, labelStyle, 'tree-safe')) {
    byTargetId[entry.targetId] = entry.source;
  }
  return byTargetId;
}

function buildFallbackSvg(title: string): string {
  return `
    <svg viewBox="0 0 560 160" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
      <rect width="560" height="160" rx="16" fill="#0f1720" />
      <text x="22" y="36" font-family="IBM Plex Sans, sans-serif" font-size="16" fill="#f8f5ee">${title}</text>
      <text x="22" y="68" font-family="IBM Plex Sans, sans-serif" font-size="13" fill="#9aa4b2">Waiting for extractor output…</text>
      <text x="22" y="92" font-family="IBM Plex Sans, sans-serif" font-size="13" fill="#9aa4b2">Move cursor into a rule or click Refresh.</text>
    </svg>
  `.trim();
}

function createEmptyIr(sourceLength: number): PatternIr {
  return {
    scope: {
      kind: 'pattern_function',
      text_range: { start: 0, end: sourceLength },
      pattern_range: { start: 0, end: sourceLength },
      action_range: { start: 0, end: sourceLength },
    },
    nodes: [],
    edges: [],
    roots: [],
    constraints: [],
    action_effects: [],
    seed_facts: [],
    display_templates: [],
    typst_templates: [],
    precedence_templates: [],
    diagnostics: [],
  };
}

function buildFixtureFromIr(
  fileName: string,
  description: string,
  ruleLabel: string,
  ir: PatternIr,
  mode: DotViewMode,
  labelStyle: DotLabelStyle,
): PreviewFixture {
  return {
    fileName,
    description: `${description} Active rule: ${ruleLabel}.`,
    dot: patternIrToDotWithMode(ir, mode, labelStyle, 'tree-safe', {}),
    svg: buildFallbackSvg(`${fileName} · ${ruleLabel}`),
    ir,
    typstSources: buildTypstSourcesFromIr(ir, mode, labelStyle),
  };
}

function deriveTypstStatusByTargetId(
  typstSources: Record<string, string>,
  typstRenderings: Record<string, RenderedTypstSnippet>,
): Record<string, string> {
  return Object.fromEntries(
    Object.keys(typstSources).map((targetId) => {
      const rendering = typstRenderings[targetId];
      if (!rendering) {
        return [targetId, 'Typst: pending'];
      }
      return [targetId, rendering.mode === 'math' ? 'Typst: rendered' : 'Typst: fallback text'];
    }),
  );
}

function describeConstraintScope(
  entry: PreviewConstraintEntry,
  activeState: PreviewInteractionState,
): string {
  if (activeState.constraintFilterMode !== 'node-specific') {
    return entry.referencedNodeIds.join(', ');
  }
  if (!activeState.constraintFilterNodeId) {
    return 'Pick a node to scope constraints.';
  }
  return `Scoped to ${activeState.constraintFilterNodeId}`;
}

function buildTypstPreviewInlineStyle(rendered: RenderedTypstSnippet) {
  const safeWidth = rendered.width > 0 ? rendered.width : 48;
  const safeHeight = rendered.height > 0 ? rendered.height : 16;
  const scale = Math.min(4, Math.max(2.5, 34 / safeHeight));
  return {
    width: `${safeWidth * scale}px`,
    height: `${safeHeight * scale}px`,
  };
}

function mergeTypstSources(
  baseSources: Record<string, string>,
  overrides: Record<string, string>,
): Record<string, string> {
  const merged = { ...baseSources };
  for (const [targetId, source] of Object.entries(overrides)) {
    const trimmed = source.trim();
    if (trimmed.length === 0) {
      delete merged[targetId];
      continue;
    }
    merged[targetId] = trimmed;
  }
  return merged;
}

async function loadSnapshotDemoText(demo: SnapshotDemo): Promise<{
  text: string;
  status: string;
}> {
  if (demo.format === 'json') {
    return {
      text: demo.source ?? '',
      status: `Loaded JSON snapshot demo ${demo.label}.`,
    };
  }

  const response = await fetch(demo.url ?? '');
  if (!response.ok) {
    throw new Error(`failed to fetch ${demo.label}: ${response.status} ${response.statusText}`);
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  const { header, snapshot } = decodeBinaryPersistedSnapshot(bytes);
  return {
    text: JSON.stringify(snapshot, null, 2),
    status: `Loaded binary snapshot demo ${demo.label} (${header.payload_codec}, ${bytes.length} bytes).`,
  };
}

async function loadSnapshotFile(file: File): Promise<{
  text: string;
  status: string;
}> {
  const lowerName = file.name.toLowerCase();
  if (lowerName.endsWith('.egbin')) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { header, snapshot } = decodeBinaryPersistedSnapshot(bytes);
    return {
      text: JSON.stringify(snapshot, null, 2),
      status: `Loaded uploaded binary snapshot ${file.name} (${header.payload_codec}, ${bytes.length} bytes).`,
    };
  }

  const text = await file.text();
  try {
    JSON.parse(text);
    return {
      text,
      status: `Loaded uploaded JSON snapshot ${file.name}.`,
    };
  } catch {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const { header, snapshot } = decodeBinaryPersistedSnapshot(bytes);
    return {
      text: JSON.stringify(snapshot, null, 2),
      status: `Loaded uploaded binary snapshot ${file.name} (${header.payload_codec}, ${bytes.length} bytes).`,
    };
  }
}

function findGraphNodeTargetId(target: EventTarget | null): string {
  if (!(target instanceof Element)) {
    return '';
  }
  const nodeGroup = target.closest('g.node');
  return nodeGroup?.querySelector('title')?.textContent?.trim() ?? '';
}

function renderTypstPreview(
  targetId: string,
  fallbackSource: string,
  typstRenderings: Record<string, RenderedTypstSnippet>,
  typstStatusByTargetId: Record<string, string>,
) {
  const typst = typstRenderings[targetId];
  if (!typst) {
    return <div className="status-pill">{typstStatusByTargetId[targetId] ?? 'Typst: no source'}</div>;
  }
  if (typst.mode === 'text-fallback') {
    return (
      <pre className="typst-fallback-text">
        {displayTextFallbackSource(normalizeTypstMathSource(fallbackSource))}
      </pre>
    );
  }
  return (
    <div className="typst-preview compact">
      <div
        className="typst-preview-inline"
        style={buildTypstPreviewInlineStyle(typst)}
        dangerouslySetInnerHTML={{ __html: typst.svg }}
      />
    </div>
  );
}

function renderSelectedTypstPreview(
  rendering: RenderedTypstSnippet | null,
  fallbackSource: string,
  status: string,
) {
  if (!rendering) {
    return <div className="status-pill">{status}</div>;
  }
  if (rendering.mode === 'text-fallback') {
    return (
      <pre className="typst-fallback-text">
        {displayTextFallbackSource(normalizeTypstMathSource(fallbackSource))}
      </pre>
    );
  }
  return (
    <div className="typst-preview selected">
      <div
        className="typst-preview-selected"
        dangerouslySetInnerHTML={{ __html: rendering.svg }}
      />
    </div>
  );
}

function closeSnapshotTypstOverlay(
  overlays: SnapshotTypstOverlay[],
  overlayId: string,
): SnapshotTypstOverlay[] {
  return overlays.filter((overlay) => overlay.id !== overlayId);
}

function colorFromSeed(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  const hue = hash % 360;
  return `hsl(${hue} 85% 54%)`;
}

export default function App() {
  const initialSample = sampleFiles.find((file) => file.id === defaultSampleId) ?? sampleFiles[0];
  const [selectedId, setSelectedId] = useState(initialSample.id);
  const [source, setSource] = useState(initialSample.source);
  const [dotViewMode, setDotViewMode] = useState<DotViewMode>('combined');
  const [detailExpanded, setDetailExpanded] = useState(false);
  const [interactionState, setInteractionState] = useState<PreviewInteractionState>(
    createDefaultPreviewInteractionState(),
  );
  const [cursorUtf16Offset, setCursorUtf16Offset] = useState(0);
  const [typstRenderings, setTypstRenderings] = useState<Record<string, RenderedTypstSnippet>>({});
  const [typstOverrides, setTypstOverrides] = useState<Record<string, string>>({});
  const [typstStatus, setTypstStatus] = useState('Waiting to render shared typst targets...');
  const [clipboardStatus, setClipboardStatus] = useState('');
  const [vimEnabled, setVimEnabled] = useState(true);
  const [graphContextMenu, setGraphContextMenu] = useState<GraphContextMenuState>(closedGraphContextMenu);
  const [graphZoomState, setGraphZoomState] = useState<GraphZoomState>(closedGraphZoom);
  const [graphZoomScale, setGraphZoomScale] = useState(1);
  const [focusMode, setFocusMode] = useState(false);
  const [snapshotMode, setSnapshotMode] = useState(false);
  const [snapshotGraphMode, setSnapshotGraphMode] = useState<'rows' | 'eqclass' | 'typst'>('typst');
  const [snapshotTypstOverlays, setSnapshotTypstOverlays] = useState<SnapshotTypstOverlay[]>([]);
  const [selectedSnapshotDemoId, setSelectedSnapshotDemoId] = useState(snapshotDemos[0]?.id ?? '');
  const [snapshotInput, setSnapshotInput] = useState('');
  const [snapshotStatus, setSnapshotStatus] = useState('Paste PersistedSnapshot JSON to inspect serialized egraph state.');
  const [snapshotModel, setSnapshotModel] = useState<SnapshotInspectorModel | null>(null);
  const [snapshotGraphSvg, setSnapshotGraphSvg] = useState('');
  const [transpilerEnabled] = useState(true);
  const [transpilerInput, setTranspilerInput] = useState('');
  const [transpilerStatus, setTranspilerStatus] = useState('Enable the .egg editor, then type or paste egglog code.');
  const [transpilerBusy, setTranspilerBusy] = useState(false);
  const [eggRuleMapping, setEggRuleMapping] = useState<EggRuleMapping | null>(null);
  const [typstEditorTargetId, setTypstEditorTargetId] = useState('');
  const [typstEditorValue, setTypstEditorValue] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const graphPreviewRef = useRef<HTMLDivElement | null>(null);
  const graphZoomContentRef = useRef<HTMLDivElement | null>(null);
  const snapshotFileInputRef = useRef<HTMLInputElement | null>(null);
  const snapshotTypstOverlayDragRef = useRef<{
    active: boolean;
    overlayId: string;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  }>({
    active: false,
    overlayId: '',
    startX: 0,
    startY: 0,
    originX: 0,
    originY: 0,
  });
  const graphZoomPanRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    startScrollLeft: number;
    startScrollTop: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    startScrollLeft: 0,
    startScrollTop: 0,
  });
  const graphZoomSuppressClickRef = useRef(false);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const eggEditorRef = useRef<MonacoEditorInstance | null>(null);
  const vimModeRef = useRef<{ dispose: () => void } | null>(null);
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null);

  const selectedFile = useMemo(
    () => sampleFiles.find((file) => file.id === selectedId) ?? sampleFiles[0],
    [selectedId],
  );
  const selectedSnapshotDemo = useMemo(
    () => snapshotDemos.find((demo) => demo.id === selectedSnapshotDemoId) ?? snapshotDemos[0] ?? null,
    [selectedSnapshotDemoId],
  );
  const cursorByteOffset = useMemo(
    () => utf16OffsetToUtf8ByteOffset(source, cursorUtf16Offset),
    [cursorUtf16Offset, source],
  );
  const [activeRuleScope, setActiveRuleScope] = useState<{
    label: string;
    ir: PatternIr;
    source: 'extractor';
  } | null>(null);
  const [ruleSyncStatus, setRuleSyncStatus] = useState('Waiting for extractor...');
  const [graphSvg, setGraphSvg] = useState('');
  const [graphLayoutStatus, setGraphLayoutStatus] = useState('Graph layout: waiting...');
  const emptyIr = useMemo(() => createEmptyIr(selectedFile.source.length), [selectedFile.source.length]);
  const effectiveLabelStyle = detailExpanded ? 'full' : 'recursive';
  const fixtureBase = useMemo(() => {
    if (!activeRuleScope) {
      return buildFixtureFromIr(
        selectedFile.label,
        selectedFile.description,
        'pending scope',
        emptyIr,
        dotViewMode,
        effectiveLabelStyle,
      );
    }
    return buildFixtureFromIr(
      selectedFile.label,
      selectedFile.description,
      activeRuleScope.label,
      activeRuleScope.ir,
      dotViewMode,
      effectiveLabelStyle,
    );
  }, [activeRuleScope, dotViewMode, effectiveLabelStyle, emptyIr, selectedFile]);
  const fixture = useMemo(
    () => ({
      ...fixtureBase,
      typstSources: mergeTypstSources(
        activeRuleScope
          ? buildTypstSourcesFromIr(activeRuleScope.ir, dotViewMode, effectiveLabelStyle)
          : fixtureBase.typstSources,
        typstOverrides,
      ),
    }),
    [activeRuleScope, dotViewMode, effectiveLabelStyle, fixtureBase, typstOverrides],
  );

  const stats = useMemo(() => {
    const lines = source.split('\n');
    return {
      lineCount: lines.length,
      charCount: source.length,
      keywordHits: countKeywordHits(source).slice(0, 5),
    };
  }, [source]);

  const allConstraints = useMemo(
    () => buildConstraintEntries(fixture.ir, { includeInlineHidden: true }),
    [fixture],
  );
  const visibleConstraintPool = useMemo(() => buildConstraintEntries(fixture.ir), [fixture]);
  const ruleChecks = useMemo(() => findRedundantActionInsertChecks(fixture.ir), [fixture]);
  const projection = useMemo(
    () => projectPreviewInteractionState(interactionState, ruleChecks, visibleConstraintPool),
    [interactionState, ruleChecks, visibleConstraintPool],
  );
  const activeState = projection.state;
  const typstStatusByTargetId = useMemo(
    () => deriveTypstStatusByTargetId(fixture.typstSources, typstRenderings),
    [fixture.typstSources, typstRenderings],
  );
  const previewState = useMemo(
    () =>
      buildPreviewPanelState({
        mode: dotViewMode,
        sourceMode: 'ast',
        selectedLabelStyle: 'recursive',
        effectiveLabelStyle,
        recursiveStrategy: 'tree-safe',
        fileName: fixture.fileName,
        dot: fixture.dot,
        svg: fixture.svg,
        typstRenderings,
        typstSources: fixture.typstSources,
        typstStatusByTargetId,
        sourceTargetIds: collectSourceTargetIds(fixture.ir, dotViewMode),
        allConstraints,
        constraints: visibleConstraintPool,
        ruleChecks,
        interactionState: activeState,
        metadataSourceFiles: [],
        metadataSourcesView: buildMetadataSourcesView(fixture.fileName, [], []),
        recoveryMode: 'off',
        tracePath: '',
        recoverySummary: null,
        recoveryDiagnostics: [],
        sourceWarning: null,
        showSwitchToAst: false,
        notice: `${fixture.description} Shared contract imported from the plugin repo.`,
      }),
    [
      activeState,
      allConstraints,
      dotViewMode,
      effectiveLabelStyle,
      fixture,
      ruleChecks,
      typstRenderings,
      typstStatusByTargetId,
      visibleConstraintPool,
    ],
  );
  const constraintCounts = useMemo(
    () => buildConstraintCountByNodeId(visibleConstraintPool),
    [visibleConstraintPool],
  );

  useEffect(() => {
    if (snapshotMode || !snapshotModel) {
      return;
    }
    setSnapshotGraphSvg('');
  }, [snapshotMode, snapshotModel]);

  useEffect(() => {
    if (!snapshotMode) {
      return;
    }
    if (!snapshotModel) {
      setSnapshotGraphSvg('');
      setGraphLayoutStatus('Snapshot graph: waiting for valid PersistedSnapshot JSON...');
      return;
    }

    let cancelled = false;
    const startedAt = performance.now();
    setGraphLayoutStatus('Snapshot graph: running Graphviz dot...');
    void (async () => {
      try {
        const dot = snapshotGraphMode === 'eqclass' && snapshotModel.eqClassDot
          ? snapshotModel.eqClassDot
          : snapshotGraphMode === 'typst' && snapshotModel.typstDot
            ? snapshotModel.typstDot
            : snapshotModel.rowsDot;
        const svg = await renderDotToSvg(
          dot,
          {},
          {},
          snapshotGraphMode === 'typst'
            ? Object.fromEntries(snapshotTypstOverlays.map((overlay) => [overlay.nodeId, overlay.color]))
            : {},
        );
        if (cancelled) {
          return;
        }
        setSnapshotGraphSvg(svg);
        setGraphLayoutStatus(
          `Snapshot graph rendered in ${(performance.now() - startedAt).toFixed(0)}ms.`,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setSnapshotGraphSvg('');
        setGraphLayoutStatus(`Snapshot graph failed: ${message}`);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshotGraphMode, snapshotMode, snapshotModel, snapshotTypstOverlays]);

  useEffect(() => {
    if (!snapshotMode || snapshotGraphMode !== 'typst' || !snapshotModel) {
      if (snapshotTypstOverlays.length > 0) {
        setSnapshotTypstOverlays([]);
      }
      return;
    }

    const pending = snapshotTypstOverlays.filter((overlay) => overlay.status.startsWith('Rendering '));
    if (pending.length === 0) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const { renderWebTypstSnippets } = await import('./webTypstAdapter');
        const renderings = await renderWebTypstSnippets(
          pending.map((overlay) => ({ targetId: overlay.id, source: overlay.source })),
        );
        if (cancelled) {
          return;
        }
        setSnapshotTypstOverlays((current) =>
          current.map((overlay) => {
            const rendering = renderings[overlay.id];
            if (!overlay.status.startsWith('Rendering ')) {
              return overlay;
            }
            return {
              ...overlay,
              rendering: rendering ?? null,
              status: rendering ? 'Typst preview ready.' : 'Typst preview unavailable.',
            };
          }),
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setSnapshotTypstOverlays((current) =>
          current.map((overlay) =>
            overlay.status.startsWith('Rendering ')
              ? { ...overlay, rendering: null, status: `Typst preview failed: ${message}` }
              : overlay,
          ),
        );
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [snapshotGraphMode, snapshotMode, snapshotModel, snapshotTypstOverlays]);

  useEffect(() => {
    if (!snapshotMode || !selectedSnapshotDemo) {
      return;
    }
    setSnapshotTypstOverlays([]);
    let cancelled = false;
    setSnapshotStatus(
      selectedSnapshotDemo.format === 'binary'
        ? `Loading binary snapshot demo ${selectedSnapshotDemo.label}...`
        : `Loading JSON snapshot demo ${selectedSnapshotDemo.label}...`,
    );
    void loadSnapshotDemoText(selectedSnapshotDemo)
      .then(({ text, status }) => {
        if (cancelled) {
          return;
        }
        setSnapshotInput(text);
        setSnapshotStatus(status);
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setSnapshotInput('');
        setSnapshotStatus(`Snapshot demo load failed: ${message}`);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSnapshotDemo, snapshotMode]);

  useEffect(() => {
    const nextInput = snapshotInput.trim();
    if (!nextInput) {
      setSnapshotModel(null);
      setSnapshotTypstOverlays([]);
      setSnapshotStatus('Paste PersistedSnapshot JSON to inspect serialized egraph state.');
      return;
    }
    try {
      const parsed = JSON.parse(nextInput);
      const model = buildSnapshotInspectorModel(parsed);
      setSnapshotModel(model);
      setSnapshotTypstOverlays([]);
      setSnapshotGraphMode(model.typstDot ? 'typst' : model.eqClassDot ? 'eqclass' : 'rows');
      setSnapshotStatus(
        `Loaded snapshot with ${model.stats.classCount} row-graph classes, ${model.stats.eqClassCount} eq-class payload group(s), ${model.stats.functionRowCount} function row(s), and ${model.stats.factCount} fact row(s).`,
      );
    } catch (error) {
      setSnapshotModel(null);
      setSnapshotTypstOverlays([]);
      const message = error instanceof Error ? error.message : String(error);
      setSnapshotStatus(`Snapshot parse failed: ${message}`);
    }
  }, [snapshotInput]);

  const handleSnapshotFileUpload = async (event: ReactMouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    snapshotFileInputRef.current?.click();
  };

  const handleSnapshotFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    try {
      setSnapshotStatus(`Loading uploaded snapshot ${file.name}...`);
      const { text, status } = await loadSnapshotFile(file);
      setSnapshotInput(text);
      setSnapshotStatus(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setSnapshotStatus(`Uploaded snapshot parse failed: ${message}`);
    } finally {
      event.target.value = '';
    }
  };

  useEffect(() => {
    let cancelled = false;
    const startedAt = performance.now();

    if (snapshotMode) {
      return () => {
        cancelled = true;
      };
    }

    setGraphSvg(fixture.svg);
    setGraphLayoutStatus('Graph layout: running Graphviz dot...');

    const runLayout = async () => {
      try {
        const svg = await renderDotToSvg(previewState.dot, typstRenderings, fixture.typstSources);
        if (cancelled) {
          return;
        }
        setGraphSvg(svg);
        setGraphLayoutStatus(
          `Graphviz dot layout rendered in ${(performance.now() - startedAt).toFixed(0)}ms.`,
        );
      } catch (error) {
        if (cancelled) {
          return;
        }
        const message = error instanceof Error ? error.message : String(error);
        setGraphSvg(fixture.svg);
        setGraphLayoutStatus(`Graphviz layout failed; showing fallback snapshot. (${message})`);
      }
    };

    runLayout().catch((error) => {
      if (cancelled) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setGraphSvg(fixture.svg);
      setGraphLayoutStatus(`Graphviz layout failed; showing fallback snapshot. (${message})`);
    });

    return () => {
      cancelled = true;
    };
  }, [fixture.svg, previewState.dot, refreshNonce, typstRenderings]);

  useEffect(() => {
    setDotViewMode('combined');
    setCursorUtf16Offset(0);
    setActiveRuleScope(null);
    setRuleSyncStatus('Waiting for extractor...');
    setInteractionState(createDefaultPreviewInteractionState());
    setTypstOverrides({});
    setGraphContextMenu(closedGraphContextMenu);
    setTypstEditorTargetId('');
    setTypstEditorValue('');
    setClipboardStatus('');
  }, [selectedFile]);

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          setRuleSyncStatus(`Extracting rule scope at byte offset ${cursorByteOffset}...`);
          let ir = await extractPatternIr(source, cursorByteOffset);
          let usedFallbackOffset: number | null = null;
          if (isEmptyRuleScope(ir)) {
            const fallbackOffset = findFirstRuleCallOffset(source);
            if (fallbackOffset !== null && fallbackOffset !== cursorByteOffset) {
              try {
                const fallbackIr = await extractPatternIr(source, fallbackOffset);
                if (!isEmptyRuleScope(fallbackIr)) {
                  ir = fallbackIr;
                  usedFallbackOffset = fallbackOffset;
                }
              } catch {
                // Keep original extraction result when fallback scope lookup fails.
              }
            }
          }

          if (cancelled) {
            return;
          }
          const label = scopeLabelFromIr(ir);
          setActiveRuleScope({ label, ir, source: 'extractor' });
          if (usedFallbackOffset !== null) {
            setRuleSyncStatus(
              `Cursor scope was empty; using first rule at ${label} (fallback byte offset ${usedFallbackOffset}).`,
            );
          } else {
            setRuleSyncStatus(`Cursor bound to ${label} (byte offset ${cursorByteOffset}).`);
          }
        } catch (error) {
          if (cancelled) {
            return;
          }
          const message = error instanceof Error ? error.message : String(error);
          setActiveRuleScope(null);
          setRuleSyncStatus(
            `No supported rule scope at byte offset ${cursorByteOffset}. (${message})`,
          );
        }
      })();
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cursorByteOffset, refreshNonce, selectedFile, source]);

  useEffect(() => {
    if (!editorRef.current) {
      return;
    }
    if (!vimEnabled) {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
      if (statusRef.current) {
        statusRef.current.textContent = 'Vim mode off';
      }
      return;
    }
    if (!statusRef.current) {
      return;
    }
    vimModeRef.current?.dispose();
    vimModeRef.current = initVimMode(editorRef.current, statusRef.current);
  }, [vimEnabled]);

  useEffect(() => {
    return () => {
      cursorListenerRef.current?.dispose();
      cursorListenerRef.current = null;
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
      editorRef.current = null;
      eggEditorRef.current = null;
    };
  }, []);

  useEffect(() => {
    const hideFloatingUi = () => {
      setGraphContextMenu(closedGraphContextMenu);
      setTypstEditorTargetId('');
      setTypstEditorValue('');
    };

    window.addEventListener('click', hideFloatingUi);
    window.addEventListener('resize', hideFloatingUi);
    window.addEventListener('scroll', hideFloatingUi, true);
    return () => {
      window.removeEventListener('click', hideFloatingUi);
      window.removeEventListener('resize', hideFloatingUi);
      window.removeEventListener('scroll', hideFloatingUi, true);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const entries = Object.entries(fixture.typstSources).map(([targetId, sourceText]) => ({
      targetId,
      source: sourceText,
    }));
    if (entries.length === 0) {
      setTypstRenderings({});
      setTypstStatus('No typst targets in this fixture.');
      return undefined;
    }

    const runRender = async () => {
      const maxAttempts = 3;
      setTypstStatus(`Rendering ${entries.length} shared typst target(s) in the browser...`);
      const startedAt = performance.now();
      const { renderWebTypstSnippets } = await import('./webTypstAdapter');
      const renderings: Record<string, RenderedTypstSnippet> = {};
      let remaining = entries;
      let attempts = 0;

      while (!cancelled && remaining.length > 0 && attempts < maxAttempts) {
        attempts += 1;
        if (attempts > 1) {
          setTypstStatus(
            `Retrying ${remaining.length} unresolved typst target(s) (attempt ${attempts}/${maxAttempts})...`,
          );
        }
        const batch = await renderWebTypstSnippets(remaining);
        Object.assign(renderings, batch);
        remaining = remaining.filter((entry) => !Object.prototype.hasOwnProperty.call(renderings, entry.targetId));
      }

      if (cancelled) {
        return;
      }
      setTypstRenderings(renderings);
      setTypstStatus(
        `Shared typst adapter rendered ${Object.keys(renderings).length}/${entries.length} target(s) in ${(
          performance.now() - startedAt
        ).toFixed(0)}ms over ${attempts} attempt(s).`,
      );
    };

    runRender().catch((error) => {
      if (cancelled) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setTypstRenderings({});
      setTypstStatus(`Shared typst adapter failed: ${message}`);
    });

    return () => {
      cancelled = true;
    };
  }, [fixture, refreshNonce]);

  const handleMount: OnMount = (editor) => {
    editorRef.current = editor;
    if (vimEnabled && statusRef.current) {
      vimModeRef.current?.dispose();
      vimModeRef.current = initVimMode(editor, statusRef.current);
    } else if (statusRef.current) {
      statusRef.current.textContent = 'Vim mode off';
    }
    cursorListenerRef.current?.dispose();
    const model = editor.getModel();
    if (model) {
      const initialPosition = editor.getPosition();
      if (initialPosition) {
        setCursorUtf16Offset(model.getOffsetAt(initialPosition));
      }
      cursorListenerRef.current = editor.onDidChangeCursorPosition((event) => {
        setCursorUtf16Offset(model.getOffsetAt(event.position));
      });
    }
    editor.focus();
  };

  const handleEggEditorMount: OnMount = (editor) => {
    eggEditorRef.current = editor;
  };

  const handleSelectSample = (sampleId: string) => {
    startTransition(() => {
      setSelectedId(sampleId);
    });
  };

  const revealRangeInEditor = (
    editor: MonacoEditorInstance | null,
    sourceText: string,
    range: RangeLike,
  ) => {
    if (!editor) {
      return;
    }
    const model = editor.getModel();
    if (!model) {
      return;
    }
    const startOffset = utf8ByteOffsetToUtf16Offset(sourceText, range.start);
    const endOffset = utf8ByteOffsetToUtf16Offset(sourceText, range.end);
    const startPosition = model.getPositionAt(startOffset);
    const endPosition = model.getPositionAt(endOffset);
    editor.setSelection({
      startLineNumber: startPosition.lineNumber,
      startColumn: startPosition.column,
      endLineNumber: endPosition.lineNumber,
      endColumn: endPosition.column,
    });
    editor.revealLineInCenter(startPosition.lineNumber);
    editor.focus();
  };

  const revealRuleSourceForEggMode = () => {
    if (!eggRuleMapping || !activeRuleScope || source !== eggRuleMapping.generatedRust) {
      return false;
    }
    const rustRuleOrdinal = findRuleOrdinalAtRustOffset(
      activeRuleScope.ir.scope.text_range.start,
      eggRuleMapping.rustRuleCallOffsets,
    );
    const eggRuleRange = eggRuleMapping.eggRuleRanges[rustRuleOrdinal];
    if (!eggRuleRange) {
      return false;
    }
    revealRangeInEditor(eggEditorRef.current, transpilerInput, eggRuleRange);
    setClipboardStatus(`Jumped to .egg rule ${rustRuleOrdinal + 1}.`);
    return true;
  };

  const revealTargetSource = (targetId: string) => {
    if (resolveSourceSpan(fixture.ir, targetId) && !revealRuleSourceForEggMode()) {
      const span = resolveSourceSpan(fixture.ir, targetId);
      if (span) {
        revealRangeInEditor(editorRef.current, source, span);
        setClipboardStatus(`Jumped to ${targetId} in generated Rust.`);
        return;
      }
    }
    if (revealRuleSourceForEggMode()) {
      return;
    }
    setClipboardStatus(`No source link available for ${targetId}.`);
  };

  const handleNodeDrilldown = (targetId: string) => {
    const nextState = drilldownConstraintNode(
      activeState,
      targetId,
      visibleConstraintPool.filter((constraint) => constraint.referencedNodeIds.includes(targetId)),
    );
    setInteractionState(nextState);
  };

  const handleGraphClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    if (graphZoomSuppressClickRef.current) {
      graphZoomSuppressClickRef.current = false;
      return;
    }
    if (snapshotMode && (!graphZoomState.open || graphZoomState.sourceMode === 'snapshot')) {
      if (snapshotGraphMode === 'typst') {
        const targetId = findGraphNodeTargetId(event.target);
        const source = targetId ? snapshotModel?.typstSources[targetId] ?? '' : '';
        if (targetId && source) {
          setSnapshotTypstOverlays((current) => [
            ...current,
            (() => {
              const overlayId = `${targetId}:${Date.now()}:${current.length}`;
              return {
                id: overlayId,
                nodeId: targetId,
                source,
                status: `Rendering typst preview for ${targetId}...`,
                rendering: null,
                x: event.clientX,
                y: event.clientY,
                scale: 2,
                color: colorFromSeed(overlayId),
              };
            })(),
          ]);
        }
      }
      return;
    }
    const targetId = findGraphNodeTargetId(event.target);
    if (!targetId) {
      return;
    }
    handleNodeDrilldown(targetId);
    revealTargetSource(targetId);
    setGraphContextMenu(closedGraphContextMenu);
    if (graphZoomState.open) {
      setGraphZoomState(closedGraphZoom);
    }
  };

  const handleGraphContextMenu = (event: ReactMouseEvent<HTMLDivElement>) => {
    const targetId = findGraphNodeTargetId(event.target);
    event.preventDefault();
    event.stopPropagation();
    const nodeConstraints = targetId
      ? visibleConstraintPool.filter((constraint) => constraint.referencedNodeIds.includes(targetId))
      : [];
    setGraphContextMenu({
      open: true,
      x: event.clientX,
      y: event.clientY,
      targetId,
      typstSource: targetId ? fixture.typstSources[targetId] ?? '' : '',
      typstStatus: targetId ? typstStatusByTargetId[targetId] ?? 'Typst: no source' : 'Typst: no source',
      nodeConstraints,
    });
    setTypstEditorTargetId('');
    setTypstEditorValue('');
  };

  const handleGraphDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetId = findGraphNodeTargetId(event.target);
    if (targetId) {
      revealTargetSource(targetId);
      setGraphContextMenu(closedGraphContextMenu);
      return;
    }
    setGraphContextMenu(closedGraphContextMenu);
    setGraphZoomState({
      open: true,
      sourceMode: snapshotMode ? 'snapshot' : 'code',
      svg: snapshotMode ? snapshotGraphSvg : graphSvg,
    });
  };

  const handleToggleFocusMode = () => {
    const nextFocusMode = !focusMode;
    setFocusMode(nextFocusMode);
    setGraphContextMenu(closedGraphContextMenu);
    setClipboardStatus(
      nextFocusMode
        ? 'Entered Focus Mode. Graph pane now owns the inspector area.'
        : 'Exited Focus Mode.',
    );
  };

  const handleGraphZoomDoubleClick = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    const targetId = findGraphNodeTargetId(event.target);
    if (!targetId) {
      return;
    }
    handleNodeDrilldown(targetId);
    revealTargetSource(targetId);
    setGraphContextMenu(closedGraphContextMenu);
    setGraphZoomState(closedGraphZoom);
  };

  const handleGraphZoomWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    const container = graphZoomContentRef.current;
    if (!container) {
      return;
    }

    event.preventDefault();
    const rect = container.getBoundingClientRect();
    const offsetX = event.clientX - rect.left;
    const offsetY = event.clientY - rect.top;

    setGraphZoomScale((current) => {
      const next = Math.min(4, Math.max(0.6, current * (event.deltaY < 0 ? 1.12 : 1 / 1.12)));
      if (next === current) {
        return current;
      }

      const contentX = (container.scrollLeft + offsetX) / current;
      const contentY = (container.scrollTop + offsetY) / current;
      requestAnimationFrame(() => {
        container.scrollLeft = contentX * next - offsetX;
        container.scrollTop = contentY * next - offsetY;
      });

      return next;
    });
  };

  const handleGraphZoomPointerDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const container = graphZoomContentRef.current;
    if (!container || event.button !== 0) {
      return;
    }

    graphZoomPanRef.current = {
      active: true,
      startX: event.clientX,
      startY: event.clientY,
      startScrollLeft: container.scrollLeft,
      startScrollTop: container.scrollTop,
    };
  };

  const handleGraphZoomPointerMove = (event: ReactMouseEvent<HTMLDivElement>) => {
    const container = graphZoomContentRef.current;
    const pan = graphZoomPanRef.current;
    if (!container || !pan.active) {
      return;
    }

    const deltaX = event.clientX - pan.startX;
    const deltaY = event.clientY - pan.startY;
    if (Math.abs(deltaX) > 3 || Math.abs(deltaY) > 3) {
      graphZoomSuppressClickRef.current = true;
    }
    container.scrollLeft = pan.startScrollLeft - deltaX;
    container.scrollTop = pan.startScrollTop - deltaY;
  };

  const handleGraphZoomPointerUp = (event: ReactMouseEvent<HTMLDivElement>) => {
    const pan = graphZoomPanRef.current;
    if (!pan.active) {
      return;
    }

    graphZoomPanRef.current = {
      active: false,
      startX: 0,
      startY: 0,
      startScrollLeft: 0,
      startScrollTop: 0,
    };
    event.preventDefault();
  };

  const handleSnapshotTypstOverlayDragStart = (overlayId: string, x: number, y: number, event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    snapshotTypstOverlayDragRef.current = {
      active: true,
      overlayId,
      startX: event.clientX,
      startY: event.clientY,
      originX: x,
      originY: y,
    };
  };

  const handleRefresh = () => {
    setClipboardStatus('Refreshing extractor, typst, and graph layout...');
    setGraphContextMenu(closedGraphContextMenu);
    setRefreshNonce((value) => value + 1);
  };

  const handleCopyText = async (text: string, label: string) => {
    if (!text) {
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
      setClipboardStatus(`${label} copied to clipboard.`);
      setGraphContextMenu(closedGraphContextMenu);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setClipboardStatus(`Failed to copy ${label}: ${message}`);
    }
  };

  const handleShowNodeConstraints = () => {
    if (!graphContextMenu.targetId) {
      return;
    }
    handleNodeDrilldown(graphContextMenu.targetId);
    setInteractionState((currentState) => setConstraintFilterMode(currentState, 'node-specific'));
    setGraphContextMenu(closedGraphContextMenu);
  };

  const openTypstEditor = () => {
    if (!graphContextMenu.targetId) {
      return;
    }
    setTypstEditorTargetId(graphContextMenu.targetId);
    setTypstEditorValue(graphContextMenu.typstSource);
    setGraphContextMenu(closedGraphContextMenu);
  };

  const handleSaveTypstOverride = () => {
    if (!typstEditorTargetId) {
      return;
    }
    const nextValue = typstEditorValue.trim();
    setTypstOverrides((current) => {
      const next = { ...current };
      if (nextValue.length === 0) {
        delete next[typstEditorTargetId];
      } else {
        next[typstEditorTargetId] = nextValue;
      }
      return next;
    });
    setClipboardStatus(
      nextValue.length === 0
        ? `Cleared browser typst override for ${typstEditorTargetId}.`
        : `Saved browser typst override for ${typstEditorTargetId}.`,
    );
    setTypstEditorTargetId('');
    setTypstEditorValue('');
  };

  useEffect(() => {
    if (!graphContextMenu.open) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!(event.target instanceof Node)) {
        setGraphContextMenu(closedGraphContextMenu);
        return;
      }
      if (
        event.target instanceof Element &&
        (event.target.closest('.graph-context-menu') || event.target.closest('.typst-override-panel'))
      ) {
        return;
      }
      if (graphPreviewRef.current?.contains(event.target)) {
        return;
      }
      setGraphContextMenu(closedGraphContextMenu);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGraphContextMenu(closedGraphContextMenu);
        setTypstEditorTargetId('');
        setTypstEditorValue('');
      }
    };
    const handleScroll = () => {
      setGraphContextMenu(closedGraphContextMenu);
    };
    const handleResize = () => {
      setGraphContextMenu(closedGraphContextMenu);
    };

    window.addEventListener('pointerdown', handlePointerDown, true);
    window.addEventListener('keydown', handleEscape);
    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('pointerdown', handlePointerDown, true);
      window.removeEventListener('keydown', handleEscape);
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [graphContextMenu.open]);

  useEffect(() => {
    if (!graphZoomState.open && !focusMode && snapshotTypstOverlays.length === 0) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (snapshotTypstOverlays.length > 0) {
          setSnapshotTypstOverlays([]);
          return;
        }
        if (focusMode) {
          setFocusMode(false);
          setClipboardStatus('Exited Focus Mode.');
          return;
        }
        setGraphZoomState(closedGraphZoom);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [focusMode, graphZoomState.open, snapshotTypstOverlays.length]);

  useEffect(() => {
    if (graphZoomState.open) {
      setGraphZoomScale(1);
    }
  }, [graphZoomState.open]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      const drag = snapshotTypstOverlayDragRef.current;
      if (!drag.active) {
        return;
      }
      setSnapshotTypstOverlays((current) =>
        current.map((overlay) =>
          overlay.id === drag.overlayId
            ? {
                ...overlay,
                x: drag.originX + (event.clientX - drag.startX),
                y: drag.originY + (event.clientY - drag.startY),
              }
            : overlay,
        ),
      );
    };

    const handleMouseUp = () => {
      snapshotTypstOverlayDragRef.current.active = false;
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  useEffect(() => {
    if (!transpilerEnabled) {
      return;
    }

    const nextInput = transpilerInput.trim();
    if (!nextInput) {
      setTranspilerBusy(false);
      setTranspilerStatus('Paste or edit a .egg program in the left editor.');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      void (async () => {
        try {
          setTranspilerBusy(true);
          setTranspilerStatus('Transpiling .egg source in browser wasm...');
          const generated = await transpileEggSource(nextInput);
          if (cancelled) {
            return;
          }
          setEggRuleMapping({
            eggRuleRanges: collectEggRuleRanges(nextInput),
            rustRuleCallOffsets: collectRuleCallOffsets(generated),
            generatedRust: generated,
          });
          setSource(generated);
          setClipboardStatus('Updated generated Rust from the left .egg editor.');
          setTranspilerStatus('Transpile succeeded. Generated Rust refreshed in the main editor.');
        } catch (error) {
          if (cancelled) {
            return;
          }
          setEggRuleMapping(null);
          const message = error instanceof Error ? error.message : String(error);
          setTranspilerStatus(`Transpile failed: ${message}`);
        } finally {
          if (!cancelled) {
            setTranspilerBusy(false);
          }
        }
      })();
    }, 250);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [transpilerEnabled, transpilerInput]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="panel">
          <div className="panel-header">
            <h2>Mode</h2>
          </div>
          <div className="button-row">
            <button
              className={!snapshotMode ? 'action-button active' : 'action-button'}
              onClick={() => setSnapshotMode(false)}
              type="button"
            >
              Code
            </button>
            <button
              className={snapshotMode ? 'action-button active' : 'action-button'}
              onClick={() => setSnapshotMode(true)}
              type="button"
            >
              Snapshot
            </button>
          </div>
        </div>

        {snapshotMode ? (
          <div className="panel egg-editor-panel">
            <div className="panel-header">
              <h2>Persisted Snapshot</h2>
            </div>
            <label className="sample-select-wrap">
              <select
                className="sample-select"
                onChange={(event) => setSelectedSnapshotDemoId(event.target.value)}
                value={selectedSnapshotDemoId}
              >
                {snapshotDemos.map((demo) => (
                  <option key={demo.id} value={demo.id}>
                    {demo.label}
                  </option>
                ))}
              </select>
            </label>
            {selectedSnapshotDemo ? <p className="subtle">{selectedSnapshotDemo.description}</p> : null}
            <div className="button-row">
              <button className="action-button" onClick={handleSnapshotFileUpload} type="button">
                Upload Snapshot
              </button>
              <span className="status-pill">JSON / EGBIN</span>
            </div>
            <input
              accept=".json,.egbin,application/json,application/octet-stream"
              className="visually-hidden"
              onChange={handleSnapshotFileChange}
              ref={snapshotFileInputRef}
              type="file"
            />
            <textarea
              className="typst-override-input snapshot-input"
              onChange={(event) => setSnapshotInput(event.target.value)}
              placeholder="Paste PersistedSnapshot JSON here, or upload a .json / .egbin file"
              rows={18}
              value={snapshotInput}
            />
            <p className="subtle">{snapshotStatus}</p>
            {clipboardStatus ? <p className="subtle">{clipboardStatus}</p> : null}
          </div>
        ) : (
          <>
            <div className="panel">
              <div className="panel-header">
                <h2>Demo</h2>
              </div>
              <label className="sample-select-wrap">
                <select
                  className="sample-select"
                  onChange={(event) => handleSelectSample(event.target.value)}
                  value={selectedId}
                >
                  {sampleFiles.map((file) => (
                    <option key={file.id} value={file.id}>
                      {file.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="panel egg-editor-panel">
              <div className="panel-header">
                <div>
                  <h2>.egg Editor</h2>
                  <p className="subtle egg-editor-subtitle">
                    Editing here auto-generates Rust into the main editor.
                  </p>
                </div>
              </div>
              <div className="egg-editor-frame">
                <Editor
                  defaultLanguage="plaintext"
                  language="plaintext"
                  onChange={(value) => setTranspilerInput(value ?? '')}
                  onMount={handleEggEditorMount}
                  theme="vs-dark"
                  value={transpilerInput}
                  options={{
                    automaticLayout: true,
                    fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                    fontLigatures: true,
                    fontSize: 13,
                    minimap: { enabled: false },
                    padding: { top: 16, bottom: 16 },
                    scrollBeyondLastLine: false,
                    smoothScrolling: true,
                    wordWrap: 'on',
                  }}
                />
              </div>
              <p className="subtle">{transpilerStatus}</p>
              {transpilerBusy ? <p className="subtle">Generating Rust...</p> : null}
              <p className="subtle">{ruleSyncStatus}</p>
              {clipboardStatus ? <p className="subtle">{clipboardStatus}</p> : null}
            </div>
          </>
        )}
      </aside>

      <main className={snapshotMode ? 'workspace snapshot-workspace' : 'workspace'}>
        {!snapshotMode ? (
        <section className="editor-panel">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Editor</p>
              <h2>generated_from_egg.rs</h2>
            </div>
            <div className="toolbar-meta">
              <span>{stats.lineCount} lines</span>
              <span>{stats.charCount} chars</span>
              <label className="editor-mode-toggle" htmlFor="vim-mode-toggle">
                <input
                  checked={vimEnabled}
                  id="vim-mode-toggle"
                  onChange={(event) => setVimEnabled(event.target.checked)}
                  type="checkbox"
                />
                <span className="editor-mode-toggle-slider" />
                <span className="editor-mode-toggle-label">{vimEnabled ? 'Vim on' : 'Vim off'}</span>
              </label>
            </div>
          </div>
          <div className="editor-frame">
            <Editor
              defaultLanguage="rust"
              language="rust"
              onChange={(value) => setSource(value ?? '')}
              onMount={handleMount}
              theme="vs-dark"
              value={source}
              options={{
                automaticLayout: true,
                fontFamily: 'JetBrains Mono, Menlo, Monaco, monospace',
                fontLigatures: true,
                fontSize: 14,
                minimap: { enabled: false },
                padding: { top: 16, bottom: 16 },
                scrollBeyondLastLine: false,
                smoothScrolling: true,
                wordWrap: 'on',
              }}
            />
          </div>
          <div className="vim-status" ref={statusRef} />
        </section>
        ) : null}

        <section className={focusMode ? 'preview-panel focus-mode' : 'preview-panel'}>
          <div className="toolbar">
            <div>
              <p className="eyebrow">{snapshotMode ? 'Snapshot Viewer' : 'Preview Workbench'}</p>
              <h2>{snapshotMode ? 'persisted_snapshot.json' : previewState.fileName}</h2>
            </div>
            <div className="toolbar-meta">
              <button
                className={focusMode ? 'action-button active' : 'action-button'}
                onClick={handleToggleFocusMode}
                type="button"
                disabled={snapshotMode}
              >
                {focusMode ? 'Exit Focus Mode' : 'Focus Mode'}
              </button>
              <span>{snapshotMode ? `${snapshotModel?.stats.eqClassCount || snapshotModel?.stats.classCount || 0} classes` : `${previewState.ruleChecks.length} checks`}</span>
              <span>{snapshotMode ? `${snapshotModel?.stats.functionRowCount ?? 0} rows` : `${previewState.constraints.length} visible constraints`}</span>
            </div>
          </div>

          <div className={focusMode ? 'preview-stack focus-mode' : 'preview-stack'}>
            <div className={focusMode ? 'preview-card hidden-card' : 'preview-card'}>
              <h3>{snapshotMode ? 'Persisted Snapshot Summary' : previewState.title}</h3>
              <p>{snapshotMode ? snapshotStatus : previewState.notice}</p>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">{snapshotMode ? 'Classes' : 'Nodes'}</span>
                  <strong>{snapshotMode ? snapshotModel?.stats.classCount ?? 0 : fixture.ir.nodes.length}</strong>
                </div>
                <div>
                  <span className="metric-label">{snapshotMode ? 'Function rows' : 'Action effects'}</span>
                  <strong>{snapshotMode ? snapshotModel?.stats.functionRowCount ?? 0 : fixture.ir.action_effects.length}</strong>
                </div>
                <div>
                  <span className="metric-label">{snapshotMode ? 'Facts' : 'All constraints'}</span>
                  <strong>{snapshotMode ? snapshotModel?.stats.factCount ?? 0 : previewState.allConstraints.length}</strong>
                </div>
                <div>
                  <span className="metric-label">{snapshotMode ? 'Diagnostics' : 'Tracked targets'}</span>
                  <strong>{snapshotMode ? snapshotModel?.stats.diagnosticCount ?? 0 : previewState.sourceTargetIds.length}</strong>
                </div>
              </div>
            </div>

            <div className={focusMode ? 'preview-card graph-card focus-card' : 'preview-card graph-card'}>
              <div className="panel-header">
                <h3>{snapshotMode ? 'Persisted EGraph' : 'Graph Snapshot'}</h3>
                <div className="graph-toolbar">
                  {snapshotMode ? (
                    <div className="button-row">
                      <button
                        className={snapshotGraphMode === 'rows' ? 'action-button active' : 'action-button'}
                        onClick={() => setSnapshotGraphMode('rows')}
                        type="button"
                      >
                        Rows Graph
                      </button>
                      <button
                        className={snapshotGraphMode === 'eqclass' ? 'action-button active' : 'action-button'}
                        disabled={!snapshotModel?.eqClassDot}
                        onClick={() => setSnapshotGraphMode('eqclass')}
                        type="button"
                      >
                        EqClass Graph
                      </button>
                      <button
                        className={snapshotGraphMode === 'typst' ? 'action-button active' : 'action-button'}
                        disabled={!snapshotModel?.typstDot}
                        onClick={() => setSnapshotGraphMode('typst')}
                        type="button"
                      >
                        Typst Graph
                      </button>
                    </div>
                  ) : (
                    <div className="button-row">
                      {dotViewModes.map((mode) => (
                        <button
                          key={mode}
                          className={dotViewMode === mode ? 'action-button active' : 'action-button'}
                          onClick={() => setDotViewMode(mode)}
                          type="button"
                        >
                          {modeLabel(mode)}
                        </button>
                      ))}
                      <button
                        className={detailExpanded ? 'action-button active' : 'action-button'}
                        onClick={() => setDetailExpanded((value) => !value)}
                        type="button"
                      >
                        {detailExpanded ? 'Hide Node Detail' : 'Show Node Detail'}
                      </button>
                    </div>
                  )}
                  <button className="action-button" onClick={handleRefresh} type="button">
                    Refresh
                  </button>
                </div>
              </div>
              <p className="subtle">{graphLayoutStatus}</p>
              <div
                className="graph-preview"
                onClick={handleGraphClick}
                onContextMenu={handleGraphContextMenu}
                onDoubleClick={handleGraphDoubleClick}
                ref={graphPreviewRef}
                dangerouslySetInnerHTML={{ __html: snapshotMode ? snapshotGraphSvg : graphSvg }}
              />
              {snapshotMode && snapshotGraphMode === 'typst'
                ? snapshotTypstOverlays.map((overlay) => (
                    <div
                      className="snapshot-typst-overlay"
                      key={overlay.id}
                      onClick={(event) => event.stopPropagation()}
                      style={{ left: `${overlay.x}px`, top: `${overlay.y}px`, borderColor: overlay.color }}
                    >
                      <div
                        className="snapshot-typst-overlay-bar"
                        onMouseDown={(event) => handleSnapshotTypstOverlayDragStart(overlay.id, overlay.x, overlay.y, event)}
                        style={{ background: overlay.color }}
                      />
                      <div
                        className="snapshot-typst-overlay-header"
                        onMouseDown={(event) => handleSnapshotTypstOverlayDragStart(overlay.id, overlay.x, overlay.y, event)}
                      >
                        <strong>{overlay.nodeId}</strong>
                        <div className="button-row">
                          <span className="status-pill" style={{ borderColor: overlay.color, color: overlay.color }}>
                            Size {Math.round(overlay.scale * 100)}%
                          </span>
                          <button
                            className="action-button"
                            onClick={() => setSnapshotTypstOverlays((current) => closeSnapshotTypstOverlay(current, overlay.id))}
                            type="button"
                          >
                            Close
                          </button>
                        </div>
                      </div>
                      <label className="snapshot-typst-size-control">
                        <span>Display Size</span>
                        <input
                          max="4"
                          min="1"
                          onChange={(event) =>
                            setSnapshotTypstOverlays((current) =>
                              current.map((entry) =>
                                entry.id === overlay.id ? { ...entry, scale: Number(event.target.value) } : entry,
                              ),
                            )
                          }
                          step="0.05"
                          type="range"
                          value={overlay.scale}
                        />
                      </label>
                      <p className="subtle">{overlay.status}</p>
                      <div style={{ zoom: overlay.scale }}>
                        {renderSelectedTypstPreview(overlay.rendering, overlay.source, overlay.status)}
                        {snapshotModel?.typstBasicFields[overlay.nodeId]?.length ? (
                          <div className="snapshot-typst-basic-fields">
                            {snapshotModel.typstBasicFields[overlay.nodeId].map((field) => (
                              <div className="snapshot-typst-basic-field" key={`${overlay.id}:${field}`}>
                                {field}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  ))
                : null}
              {!snapshotMode && graphContextMenu.open ? (
                <div
                  className="graph-context-menu"
                  onClick={(event) => event.stopPropagation()}
                  style={{ left: `${graphContextMenu.x}px`, top: `${graphContextMenu.y}px` }}
                >
                  <div className="graph-context-heading">
                    <strong>{graphContextMenu.targetId || 'Graph snapshot'}</strong>
                    <span>{graphContextMenu.typstStatus}</span>
                  </div>
                  <div className="button-row graph-context-actions">
                    {dotViewModes.map((mode) => (
                      <button
                        key={`ctx-${mode}`}
                        className={dotViewMode === mode ? 'action-button active' : 'action-button'}
                        onClick={() => {
                          setDotViewMode(mode);
                          setGraphContextMenu(closedGraphContextMenu);
                        }}
                        type="button"
                      >
                        {modeLabel(mode)}
                      </button>
                    ))}
                  </div>
                  <button className="menu-button" onClick={() => void handleCopyText(previewState.dot, 'DOT')} type="button">
                    Copy DOT
                  </button>
                  {graphContextMenu.typstSource ? (
                    <button
                      className="menu-button"
                      onClick={() => void handleCopyText(graphContextMenu.typstSource, 'Typst')}
                      type="button"
                    >
                      Copy Typst
                    </button>
                  ) : null}
                  <button className="menu-button" onClick={() => setInteractionState(toggleRuleCheckView(activeState))} type="button">
                    {activeState.ruleCheckViewVisible ? 'Hide Check' : 'Check'}
                  </button>
                  <button className="menu-button" onClick={handleRefresh} type="button">
                    Refresh
                  </button>
                  <button
                    className="menu-button"
                    disabled={!graphContextMenu.targetId || graphContextMenu.nodeConstraints.length === 0}
                    onClick={handleShowNodeConstraints}
                    type="button"
                  >
                    Show Constraints
                  </button>
                  <button
                    className="menu-button"
                    disabled={!graphContextMenu.typstSource}
                    onClick={openTypstEditor}
                    type="button"
                  >
                    Edit Typst
                  </button>
                </div>
              ) : null}
              {!snapshotMode && typstEditorTargetId ? (
                <div className="typst-override-panel" onClick={(event) => event.stopPropagation()}>
                  <div className="panel-header">
                    <h3>Typst Override</h3>
                    <span>{typstEditorTargetId}</span>
                  </div>
                  <textarea
                    className="typst-override-input"
                    onChange={(event) => setTypstEditorValue(event.target.value)}
                    rows={4}
                    value={typstEditorValue}
                  />
                  <div className="button-row">
                    <button className="action-button active" onClick={handleSaveTypstOverride} type="button">
                      Save override
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        setTypstOverrides((current) => {
                          const next = { ...current };
                          delete next[typstEditorTargetId];
                          return next;
                        });
                        setTypstEditorTargetId('');
                        setTypstEditorValue('');
                      }}
                      type="button"
                    >
                      Clear override
                    </button>
                    <button
                      className="action-button"
                      onClick={() => {
                        setTypstEditorTargetId('');
                        setTypstEditorValue('');
                      }}
                      type="button"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="subtle">
                {snapshotMode
                  ? snapshotGraphMode === 'eqclass'
                    ? 'EqClass Graph uses persisted eq_class_payload classes and their member rows.'
                    : snapshotGraphMode === 'typst'
                      ? 'Typst Graph renders eq-class labels from persisted typst_template + precedence metadata.'
                      : 'Rows Graph groups persisted values into row-oriented classes using restore_mapping plus unions.'
                  : typstStatus}
              </p>
            </div>

	            <div className={focusMode ? 'preview-card hidden-card' : 'preview-card'}>
	              {snapshotMode ? (
	                <>
                  <div className="panel-header">
                    <h3>Snapshot Diagnostics</h3>
                  </div>
                  <div className="list-stack">
                    {snapshotModel?.snapshot.diagnostics.length ? snapshotModel.snapshot.diagnostics.map((diagnostic, index) => (
                      <div className="list-card" key={`${diagnostic.code}-${index}`}>
                        <strong>{diagnostic.code}</strong>
                        <span>{diagnostic.message}</span>
                        <small>{diagnostic.path ?? 'snapshot root'}</small>
                      </div>
                    )) : <p>No diagnostics in this snapshot.</p>}
	                  </div>
	                </>
	              ) : (
	                <>
	                  <div className="panel-header">
	                    <h3>Rule Checks</h3>
	                    <button
	                      className="action-button"
	                      onClick={() => setInteractionState(toggleRuleCheckView(activeState))}
	                      type="button"
	                    >
	                      {activeState.ruleCheckViewVisible ? 'Hide checks' : 'Show checks'}
	                    </button>
	                  </div>
	                  {previewState.ruleChecks.length === 0 ? (
	                    <p>No redundant action inserts in this fixture.</p>
	                  ) : (
	                    <div className="list-stack">
	                      {previewState.ruleChecks.map((check) => (
	                        <button
	                          key={check.id}
	                          className={check.id === activeState.activeRuleCheckId ? 'list-card active' : 'list-card'}
	                          onClick={() => setInteractionState(selectRuleCheck(activeState, check.id))}
	                          type="button"
	                        >
	                          <strong>{check.kind}</strong>
	                          <span>{check.message}</span>
	                          <small>{check.suggestion}</small>
	                        </button>
	                      ))}
	                    </div>
	                  )}
	                </>
	              )}
	            </div>

            <div className={focusMode ? 'preview-card hidden-card' : 'preview-card'}>
              {snapshotMode ? (
                <>
                  <h3>{snapshotGraphMode === 'eqclass' ? 'EqClass Payload' : 'Equivalence Classes'}</h3>
                  <div className="list-stack">
                    {snapshotGraphMode === 'eqclass'
                      ? (snapshotModel?.eqClasses.map((eqClass) => (
                          <div className="list-card" key={eqClass.logical_id}>
                            <strong>{eqClass.debug_value ?? eqClass.logical_id}</strong>
                            <span>{eqClass.members.length} member row(s)</span>
                            <small>{eqClass.logical_id}</small>
                          </div>
                        )) ?? <p>No eq-class payload in this snapshot.</p>)
                      : (snapshotModel?.classNodes.map((classNode) => (
                          <div className="list-card" key={classNode.id}>
                            <strong>{classNode.sortName}</strong>
                            <span>{classNode.memberCount} member(s)</span>
                            <small>{classNode.memberLabels.slice(0, 3).join(' | ')}</small>
                          </div>
                        )) ?? <p>No class nodes.</p>)}
                  </div>
                </>
              ) : (
                <>
                  <div className="panel-header">
                    <h3>Constraint View</h3>
                    <div className="button-row">
                      <button
                        className={
                          activeState.constraintFilterMode === 'all' ? 'action-button active' : 'action-button'
                        }
                        onClick={() => setInteractionState(setConstraintFilterMode(activeState, 'all'))}
                        type="button"
                      >
                        All
                      </button>
                      <button
                        className={
                          activeState.constraintFilterMode === 'node-specific'
                            ? 'action-button active'
                            : 'action-button'
                        }
                        onClick={() => setInteractionState(setConstraintFilterMode(activeState, 'node-specific'))}
                        type="button"
                      >
                        Node-specific
                      </button>
                    </div>
                  </div>
                  <p className="subtle">
                    {activeState.constraintFilterMode === 'node-specific' && activeState.constraintFilterNodeId
                      ? `Scoped to node ${activeState.constraintFilterNodeId}.`
                      : 'Pick a node card to drill down or keep the full shared constraint list visible.'}
                  </p>
                  <div className="list-stack">
                    {projection.visibleConstraints.length === 0 ? (
                      <p className="empty-state">No constraints visible in the current filter mode.</p>
                    ) : (
                      projection.visibleConstraints.map((constraint) => (
                        <button
                          key={constraint.id}
                          className={
                            constraint.id === activeState.activeConstraintId ? 'list-card active' : 'list-card'
                          }
                          onClick={() => setInteractionState(selectConstraint(activeState, constraint.id))}
                          type="button"
                        >
                          <strong>{constraint.id}</strong>
                          <span>{constraint.compactText}</span>
                          <small>{describeConstraintScope(constraint, activeState)}</small>
                        </button>
                      ))
                    )}
                  </div>
                </>
              )}
            </div>

            <div className={focusMode ? 'preview-card hidden-card' : 'preview-card'}>
              {snapshotMode ? (
                <>
                  <h3>Rows And Facts</h3>
                  <div className="list-stack">
                    {snapshotModel?.opNodes.map((node) => (
                      <div className="list-card" key={node.id}>
                        <strong>{node.label}</strong>
                        <span>{node.detail}</span>
                      </div>
                    )) ?? <p>No rows.</p>}
                  </div>
                </>
              ) : (
                <>
                  <h3>Targets</h3>
                  <div className="target-grid">
                {fixture.ir.nodes.map((node) => {
                  const isHighlighted = previewState.highlightedPatternNodeIds.includes(node.id);
                  const isConstraintActive = previewState.activeConstraintNodeIds.includes(node.id);
                  const count = constraintCounts[node.id] ?? 0;
                  return (
                    <div
                      className={
                        isHighlighted || isConstraintActive ? 'target-card highlighted' : 'target-card'
                      }
                      key={node.id}
                    >
                      <div className="target-meta">
                        <strong>{node.id}</strong>
                        <span>{node.dsl_type}</span>
                      </div>
                      <p>{node.label}</p>
                      <small>{count} constraint(s)</small>
                      <div className="button-row">
                        <button className="action-button" onClick={() => handleNodeDrilldown(node.id)} type="button">
                          Drill down
                        </button>
                      </div>
                      {renderTypstPreview(
                        node.id,
                        fixture.typstSources[node.id] ?? node.label,
                        typstRenderings,
                        typstStatusByTargetId,
                      )}
                    </div>
                  );
                })}
                {fixture.ir.action_effects.map((effect) => {
                  const targetId = `effect:${effect.id}`;
                  const isHighlighted = previewState.highlightedActionEffectIds.includes(targetId);
                  return (
                    <div className={isHighlighted ? 'target-card highlighted action' : 'target-card action'} key={effect.id}>
                      <div className="target-meta">
                        <strong>{effect.id}</strong>
                        <span>action</span>
                      </div>
                      <p>{effect.source_text}</p>
                      <small>{typstStatusByTargetId[targetId] ?? 'Typst: no source'}</small>
                      {renderTypstPreview(
                        targetId,
                        fixture.typstSources[targetId] ?? effect.source_text,
                        typstRenderings,
                        typstStatusByTargetId,
                      )}
                    </div>
                  );
                })}
                {fixture.ir.seed_facts.map((seed) => {
                  const targetId = `seed:${seed.id}`;
                  return (
                    <div className="target-card seed" key={seed.id}>
                      <div className="target-meta">
                        <strong>{seed.id}</strong>
                        <span>seed</span>
                      </div>
                      <p>{seed.source_text}</p>
                      <small>{typstStatusByTargetId[targetId] ?? 'Typst: no source'}</small>
                      {renderTypstPreview(
                        targetId,
                        fixture.typstSources[targetId] ?? seed.source_text,
                        typstRenderings,
                        typstStatusByTargetId,
                      )}
                    </div>
                  );
                })}
                  </div>
                </>
              )}
            </div>

            <div className={focusMode ? 'preview-card hidden-card' : 'preview-card'}>
              {snapshotMode ? (
                <>
                  <h3>Restore Mapping</h3>
                  <div className="token-list">
                    {snapshotModel?.snapshot.restore_mapping.notes.map((note) => (
                      <span className="token-chip" key={note}>{note}</span>
                    )) ?? null}
                  </div>
                </>
              ) : (
                <>
                  <h3>Rust Shape</h3>
                  <div className="token-list">
                    {stats.keywordHits.map((entry) => (
                      <span className="token-chip" key={entry.keyword}>
                        {entry.keyword} x {entry.count}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </section>
      </main>
      {graphZoomState.open ? (
        <div className="graph-zoom-modal" onClick={() => setGraphZoomState(closedGraphZoom)}>
          <div
            className="graph-zoom-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="graph-zoom-header">
              <strong>{graphZoomState.sourceMode === 'snapshot' ? 'Snapshot Graph' : 'Graph Snapshot'}</strong>
              <div className="button-row">
                <span className="status-pill">Zoom {Math.round(graphZoomScale * 100)}%</span>
                <button className="action-button" onClick={() => setGraphZoomScale(1)} type="button">
                  Reset Zoom
                </button>
                <button className="action-button" onClick={() => setGraphZoomState(closedGraphZoom)} type="button">
                  Close
                </button>
              </div>
            </div>
            <div
              className="graph-zoom-content"
              ref={graphZoomContentRef}
              onClick={handleGraphClick}
              onDoubleClick={handleGraphZoomDoubleClick}
              onMouseDown={handleGraphZoomPointerDown}
              onMouseMove={handleGraphZoomPointerMove}
              onMouseUp={handleGraphZoomPointerUp}
              onMouseLeave={handleGraphZoomPointerUp}
              onWheel={handleGraphZoomWheel}
            >
              <div
                className="graph-zoom-canvas"
                style={{ transform: `scale(${graphZoomScale})` }}
                dangerouslySetInnerHTML={{ __html: graphZoomState.svg }}
              />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
