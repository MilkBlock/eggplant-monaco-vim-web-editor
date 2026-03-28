import { useEffect, useMemo, useRef, useState } from 'react';
import Editor, { type OnMount } from '@monaco-editor/react';
import { initVimMode } from 'monaco-vim';
import patternSamplesSource from './samples/pattern_samples.rs?raw';
import fibonacciFuncSource from './samples/fibonacci_func.rs?raw';
import relationSource from './samples/relation.rs?raw';

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

const rustKeywords = [
  'fn',
  'struct',
  'enum',
  'impl',
  'let',
  'pub',
  'use',
  'mod',
  'match',
  'if',
  'else',
  'return',
];

function countKeywordHits(source: string) {
  return rustKeywords
    .map((keyword) => ({
      keyword,
      count: (source.match(new RegExp(`\\b${keyword}\\b`, 'g')) ?? []).length,
    }))
    .filter((entry) => entry.count > 0)
    .sort((left, right) => right.count - left.count);
}

export default function App() {
  const [selectedId, setSelectedId] = useState(sampleFiles[0].id);
  const [source, setSource] = useState(sampleFiles[0].source);
  const statusRef = useRef<HTMLDivElement | null>(null);
  const vimModeRef = useRef<{ dispose: () => void } | null>(null);

  const selectedFile = useMemo(
    () => sampleFiles.find((file) => file.id === selectedId) ?? sampleFiles[0],
    [selectedId],
  );

  const stats = useMemo(() => {
    const lines = source.split('\n');
    return {
      lineCount: lines.length,
      charCount: source.length,
      keywordHits: countKeywordHits(source).slice(0, 5),
    };
  }, [source]);

  useEffect(() => {
    setSource(selectedFile.source);
  }, [selectedFile]);

  useEffect(() => {
    return () => {
      vimModeRef.current?.dispose();
      vimModeRef.current = null;
    };
  }, []);

  const handleMount: OnMount = (editor) => {
    if (!statusRef.current) {
      return;
    }
    vimModeRef.current?.dispose();
    vimModeRef.current = initVimMode(editor, statusRef.current);
    editor.focus();
  };

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand-block">
          <p className="eyebrow">Eggplant</p>
          <h1>Pattern Web Editor</h1>
          <p className="subtle">
            Monaco + Vim mode spike. Static-hostable and seeded with real Rust
            samples from the plugin repo.
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
                onClick={() => setSelectedId(file.id)}
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
            <h2>Mode</h2>
          </div>
          <ul className="fact-list">
            <li>Editor: Monaco</li>
            <li>Keybindings: Vim via `monaco-vim`</li>
            <li>Language: Rust</li>
            <li>Deploy: GitHub Pages</li>
          </ul>
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
              <h2>Static Spike</h2>
            </div>
          </div>

          <div className="preview-stack">
            <div className="preview-card">
              <h3>Current Focus</h3>
              <p>
                This deploy proves the browser editor shell: sample switching,
                Monaco editing, and Vim keybindings. The next layer is wiring
                the real Eggplant extractor/preview pipeline into this pane.
              </p>
            </div>

            <div className="preview-card">
              <h3>Selected Sample</h3>
              <p>{selectedFile.description}</p>
            </div>

            <div className="preview-card">
              <h3>Rust Shape</h3>
              <div className="metric-grid">
                <div>
                  <span className="metric-label">Functions</span>
                  <strong>{(source.match(/\bfn\b/g) ?? []).length}</strong>
                </div>
                <div>
                  <span className="metric-label">Structs</span>
                  <strong>{(source.match(/\bstruct\b/g) ?? []).length}</strong>
                </div>
                <div>
                  <span className="metric-label">Enums</span>
                  <strong>{(source.match(/\benum\b/g) ?? []).length}</strong>
                </div>
                <div>
                  <span className="metric-label">Rules</span>
                  <strong>{(source.match(/add_rule/g) ?? []).length}</strong>
                </div>
              </div>
            </div>

            <div className="preview-card">
              <h3>Top Tokens</h3>
              <div className="token-list">
                {stats.keywordHits.map((entry) => (
                  <span className="token-chip" key={entry.keyword}>
                    {entry.keyword} × {entry.count}
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
