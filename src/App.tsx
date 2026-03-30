import { startTransition, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react';
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
import { collectTypstReplacementSources, patternIrToDotWithMode, type DotViewMode } from '@eggplant-vscode/dot';
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
import { extractPatternIr } from './webExtractor';
import { renderDotToSvg } from './webDotRenderer';

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

type MonacoEditorInstance = Parameters<OnMount>[0];

const closedGraphContextMenu: GraphContextMenuState = {
  open: false,
  x: 0,
  y: 0,
  targetId: '',
  typstSource: '',
  typstStatus: 'Typst: no source',
  nodeConstraints: [],
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

function buildTypstSourcesFromIr(ir: PatternIr, mode: DotViewMode = 'combined'): Record<string, string> {
  const byTargetId: Record<string, string> = {};
  for (const entry of collectTypstReplacementSources(ir, mode, 'recursive', 'tree-safe')) {
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
): PreviewFixture {
  return {
    fileName,
    description: `${description} Active rule: ${ruleLabel}.`,
    dot: patternIrToDotWithMode(ir, mode, 'recursive', 'tree-safe', {}),
    svg: buildFallbackSvg(`${fileName} · ${ruleLabel}`),
    ir,
    typstSources: buildTypstSourcesFromIr(ir, mode),
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

export default function App() {
  const initialSample = sampleFiles.find((file) => file.id === defaultSampleId) ?? sampleFiles[0];
  const [selectedId, setSelectedId] = useState(initialSample.id);
  const [source, setSource] = useState(initialSample.source);
  const [dotViewMode, setDotViewMode] = useState<DotViewMode>('combined');
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
  const [graphZoomOpen, setGraphZoomOpen] = useState(false);
  const [typstEditorTargetId, setTypstEditorTargetId] = useState('');
  const [typstEditorValue, setTypstEditorValue] = useState('');
  const [refreshNonce, setRefreshNonce] = useState(0);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const graphPreviewRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<MonacoEditorInstance | null>(null);
  const vimModeRef = useRef<{ dispose: () => void } | null>(null);
  const cursorListenerRef = useRef<{ dispose: () => void } | null>(null);

  const selectedFile = useMemo(
    () => sampleFiles.find((file) => file.id === selectedId) ?? sampleFiles[0],
    [selectedId],
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
  const fixtureBase = useMemo(() => {
    if (!activeRuleScope) {
      return buildFixtureFromIr(
        selectedFile.label,
        selectedFile.description,
        'pending scope',
        emptyIr,
        dotViewMode,
      );
    }
    return buildFixtureFromIr(
      selectedFile.label,
      selectedFile.description,
      activeRuleScope.label,
      activeRuleScope.ir,
      dotViewMode,
    );
  }, [activeRuleScope, dotViewMode, emptyIr, selectedFile]);
  const fixture = useMemo(
    () => ({
      ...fixtureBase,
      typstSources: mergeTypstSources(
        activeRuleScope
          ? buildTypstSourcesFromIr(activeRuleScope.ir, dotViewMode)
          : fixtureBase.typstSources,
        typstOverrides,
      ),
    }),
    [activeRuleScope, dotViewMode, fixtureBase, typstOverrides],
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
        effectiveLabelStyle: 'recursive',
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
    let cancelled = false;
    const startedAt = performance.now();

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
    setSource(selectedFile.source);
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

  const handleSelectSample = (sampleId: string) => {
    startTransition(() => {
      setSelectedId(sampleId);
    });
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
    const targetId = findGraphNodeTargetId(event.target);
    if (!targetId) {
      return;
    }
    handleNodeDrilldown(targetId);
    setGraphContextMenu(closedGraphContextMenu);
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
    setGraphContextMenu(closedGraphContextMenu);
    setGraphZoomOpen(true);
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
    if (!graphZoomOpen) {
      return;
    }
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setGraphZoomOpen(false);
      }
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleEscape);
    };
  }, [graphZoomOpen]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Eggplant</p>
          <h1>Shared Core Web Shell</h1>
          <p className="subtle">
            Monaco + Vim on the left. On the right, a browser host shell driven by the same
            preview and typst contracts extracted from the VSCode plugin.
          </p>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Samples</h2>
            <span>{sampleFiles.length}</span>
          </div>
          <div className="sample-list">
            {sampleFiles.map((file) => (
              <button
                key={file.id}
                className={file.id === selectedId ? 'sample-card active' : 'sample-card'}
                onClick={() => handleSelectSample(file.id)}
                type="button"
              >
                <strong>{file.label}</strong>
                <span>{file.description}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Shared Contract</h2>
          </div>
          <ul className="fact-list">
            <li>Preview interaction: `@eggplant-shared/previewCore`</li>
            <li>Typst renderer: browser adapter over `@eggplant-shared/typstCore`</li>
            <li>Rule checks: `@eggplant-vscode/ruleChecks`</li>
            <li>Boundary: shell-only wiring, no contract fork</li>
          </ul>
        </div>

        <div className="panel">
          <div className="panel-header">
            <h2>Rule Sync</h2>
          </div>
          <p className="subtle">{ruleSyncStatus}</p>
          {clipboardStatus ? <p className="subtle">{clipboardStatus}</p> : null}
        </div>
      </aside>

      <main className="workspace">
        <section className="editor-panel">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Editor</p>
              <h2>{selectedFile.label}</h2>
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

        <section className="preview-panel">
          <div className="toolbar">
            <div>
              <p className="eyebrow">Preview Workbench</p>
              <h2>{previewState.fileName}</h2>
            </div>
            <div className="toolbar-meta">
              <span>{previewState.ruleChecks.length} checks</span>
              <span>{previewState.constraints.length} visible constraints</span>
            </div>
          </div>

          <div className="preview-stack">
            <div className="preview-card">
              <h3>{previewState.title}</h3>
              <p>{previewState.notice}</p>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Nodes</span>
                  <strong>{fixture.ir.nodes.length}</strong>
                </div>
                <div>
                  <span className="metric-label">Action effects</span>
                  <strong>{fixture.ir.action_effects.length}</strong>
                </div>
                <div>
                  <span className="metric-label">All constraints</span>
                  <strong>{previewState.allConstraints.length}</strong>
                </div>
                <div>
                  <span className="metric-label">Tracked targets</span>
                  <strong>{previewState.sourceTargetIds.length}</strong>
                </div>
              </div>
            </div>

            <div className="preview-card">
              <div className="panel-header">
                <h3>Graph Snapshot</h3>
                <div className="graph-toolbar">
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
                  </div>
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
                dangerouslySetInnerHTML={{ __html: graphSvg }}
              />
              {graphContextMenu.open ? (
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
              {typstEditorTargetId ? (
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
              <p className="subtle">{typstStatus}</p>
            </div>

            <div className="preview-card">
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
            </div>

            <div className="preview-card">
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
            </div>

            <div className="preview-card">
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
            </div>

            <div className="preview-card">
              <h3>Rust Shape</h3>
              <div className="token-list">
                {stats.keywordHits.map((entry) => (
                  <span className="token-chip" key={entry.keyword}>
                    {entry.keyword} x {entry.count}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
      {graphZoomOpen ? (
        <div className="graph-zoom-modal" onClick={() => setGraphZoomOpen(false)}>
          <div
            className="graph-zoom-panel"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="graph-zoom-header">
              <strong>Graph Snapshot</strong>
              <button className="action-button" onClick={() => setGraphZoomOpen(false)} type="button">
                Close
              </button>
            </div>
            <div
              className="graph-zoom-content"
              dangerouslySetInnerHTML={{ __html: graphSvg }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
