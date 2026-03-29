import { startTransition, useEffect, useMemo, useRef, useState } from 'react';
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
  projectPreviewInteractionState,
  selectConstraint,
  selectRuleCheck,
  setConstraintFilterMode,
  toggleRuleCheckView,
  type PreviewConstraintEntry,
  type PreviewInteractionState,
} from '@eggplant-shared/previewCore';
import type { PatternIr } from '@eggplant-vscode/ir';
import { findRedundantActionInsertChecks } from '@eggplant-vscode/ruleChecks';
import type { RenderedTypstSnippet } from '@eggplant-shared/typstCore';
import patternSamplesSource from './samples/pattern_samples.rs?raw';
import fibonacciFuncSource from './samples/fibonacci_func.rs?raw';
import relationSource from './samples/relation.rs?raw';
import { buildFixtureFromScope, webPreviewFixtures } from './webPreviewFixtures';
import { extractPatternIr } from './webExtractor';
import { renderDotToSvg } from './webDotRenderer';

type SampleFile = {
  id: string;
  label: string;
  description: string;
  source: string;
};

const sampleFiles: SampleFile[] = [
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

export default function App() {
  const [selectedId, setSelectedId] = useState(sampleFiles[0].id);
  const [source, setSource] = useState(sampleFiles[0].source);
  const [interactionState, setInteractionState] = useState<PreviewInteractionState>(
    createDefaultPreviewInteractionState(),
  );
  const [cursorUtf16Offset, setCursorUtf16Offset] = useState(0);
  const [typstRenderings, setTypstRenderings] = useState<Record<string, RenderedTypstSnippet>>({});
  const [typstStatus, setTypstStatus] = useState('Waiting to render shared typst targets...');
  const statusRef = useRef<HTMLDivElement | null>(null);
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
  const fixture = useMemo(() => {
    if (!activeRuleScope) {
      return webPreviewFixtures[selectedFile.id];
    }
    return buildFixtureFromScope(
      selectedFile.id,
      selectedFile.label,
      selectedFile.description,
      activeRuleScope.label,
      activeRuleScope.ir,
    );
  }, [activeRuleScope, selectedFile]);

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
        mode: 'combined',
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
        sourceTargetIds: collectSourceTargetIds(fixture.ir, 'combined'),
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
        const svg = await renderDotToSvg(previewState.dot);
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
  }, [fixture.svg, previewState.dot]);

  useEffect(() => {
    setSource(selectedFile.source);
    setCursorUtf16Offset(0);
    setActiveRuleScope(null);
    setRuleSyncStatus('Waiting for extractor...');
    setInteractionState(createDefaultPreviewInteractionState());
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
            `No supported rule scope at byte offset ${cursorByteOffset}; showing sample default. (${message})`,
          );
        }
      })();
    }, 120);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [cursorByteOffset, source]);

  useEffect(() => {
    return () => {
      cursorListenerRef.current?.dispose();
      cursorListenerRef.current = null;
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
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
      setTypstStatus(`Rendering ${entries.length} shared typst target(s) in the browser...`);
      const startedAt = performance.now();
      const { renderWebTypstSnippets } = await import('./webTypstAdapter');
      const renderings = await renderWebTypstSnippets(entries);
      if (cancelled) {
        return;
      }
      setTypstRenderings(renderings);
      setTypstStatus(
        `Shared typst adapter rendered ${Object.keys(renderings).length}/${entries.length} target(s) in ${(
          performance.now() - startedAt
        ).toFixed(0)}ms.`,
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
  }, [fixture]);

  const handleMount: OnMount = (editor) => {
    if (statusRef.current) {
      vimModeRef.current?.dispose();
      vimModeRef.current = initVimMode(editor, statusRef.current);
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
                <span>{graphLayoutStatus}</span>
              </div>
              <div
                className="graph-preview"
                dangerouslySetInnerHTML={{ __html: graphSvg }}
              />
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
                  const typst = typstRenderings[node.id];
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
                      {typst ? (
                        <div
                          className="typst-preview compact"
                          dangerouslySetInnerHTML={{ __html: typst.svg }}
                        />
                      ) : (
                        <div className="status-pill">{typstStatusByTargetId[node.id] ?? 'Typst: no source'}</div>
                      )}
                    </div>
                  );
                })}
                {fixture.ir.action_effects.map((effect) => {
                  const targetId = `effect:${effect.id}`;
                  const isHighlighted = previewState.highlightedActionEffectIds.includes(targetId);
                  const typst = typstRenderings[targetId];
                  return (
                    <div className={isHighlighted ? 'target-card highlighted action' : 'target-card action'} key={effect.id}>
                      <div className="target-meta">
                        <strong>{effect.id}</strong>
                        <span>action</span>
                      </div>
                      <p>{effect.source_text}</p>
                      <small>{typstStatusByTargetId[targetId] ?? 'Typst: no source'}</small>
                      {typst ? (
                        <div
                          className="typst-preview compact"
                          dangerouslySetInnerHTML={{ __html: typst.svg }}
                        />
                      ) : null}
                    </div>
                  );
                })}
                {fixture.ir.seed_facts.map((seed) => {
                  const targetId = `seed:${seed.id}`;
                  const typst = typstRenderings[targetId];
                  return (
                    <div className="target-card seed" key={seed.id}>
                      <div className="target-meta">
                        <strong>{seed.id}</strong>
                        <span>seed</span>
                      </div>
                      <p>{seed.source_text}</p>
                      <small>{typstStatusByTargetId[targetId] ?? 'Typst: no source'}</small>
                      {typst ? (
                        <div
                          className="typst-preview compact"
                          dangerouslySetInnerHTML={{ __html: typst.svg }}
                        />
                      ) : null}
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
    </div>
  );
}
