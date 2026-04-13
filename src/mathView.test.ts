import assert from 'node:assert/strict';
import test from 'node:test';

import { patternIrToDotWithMode } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/dot';
import type { PatternIr } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/ir';
import { buildMathViewModel, buildMathViewTypstSource } from './mathView';
import { resolveSampleSelectionState } from './sampleSelection';
import { buildMathRenderSources, normalizeWebTypstSource } from './typstNormalization';

test('buildMathViewModel organizes diff_mul into premises, derivations, and rewrite conclusion', () => {
  const ir: PatternIr = {
    scope: {
      kind: 'add_rule_call',
      text_range: { start: 0, end: 220 },
      pattern_range: { start: 20, end: 120 },
      action_range: { start: 121, end: 220 },
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
    math_view: {
      rule_name: 'diff_mul',
      premises: [
        { target_id: 'mul', label: 'mul', plain_source: 'a * b', colored_source: `#text(fill: rgb("#5F7A8A"))[$ a * b $]` },
        { target_id: 'diff', label: 'diff', plain_source: `(a * b)'(x)`, colored_source: `#text(fill: rgb("#5F7A8A"))[$ (a * b)'(x) $]` },
      ],
      side_conditions: ['guard(a, b)'],
      derivations: [
        { target_id: 'effect:effect_0', label: 'db', plain_source: "b'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ b'(x) $]` },
        { target_id: 'effect:effect_1', label: 'da', plain_source: "a'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ a'(x) $]` },
        { target_id: 'effect:effect_2', label: 'a_db', plain_source: "a * b'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ a * b'(x) $]` },
        { target_id: 'effect:effect_3', label: 'b_da', plain_source: "b * a'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ b * a'(x) $]` },
        { target_id: 'effect:effect_4', label: 'rhs', plain_source: "a * b'(x) + b * a'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ a * b'(x) + b * a'(x) $]` },
      ],
      conclusions: [
        {
          id: 'effect_5',
          kind: 'rewrite',
          from: { target_id: 'diff', label: 'diff', plain_source: `(a * b)'(x)`, colored_source: `#text(fill: rgb("#5F7A8A"))[$ (a * b)'(x) $]` },
          to: { target_id: 'effect:effect_4', label: 'rhs', plain_source: "a * b'(x) + b * a'(x)", colored_source: `#text(fill: rgb("#B86A5B"))[$ a * b'(x) + b * a'(x) $]` },
        },
      ],
      formula_source: {
        plain: `frac((a * b)'(x), a * b'(x) + b * a'(x)) quad upright("if") quad guard(a, b)`,
        colored: `#text(fill: rgb("#B86A5B"))[$ frac((a * b)'(x), a * b'(x) + b * a'(x)) quad upright("if") quad guard(a, b) $]`,
      },
    },
  } as PatternIr & { math_view: unknown };

  const model = buildMathViewModel(ir);

  assert.equal(model.ruleName, 'diff_mul');
  assert.deepEqual(model.premises.map((entry) => entry.targetId), ['mul', 'diff']);
  assert.equal(model.sideConditions.length, 1);
  assert.match(model.sideConditions[0], /guard/);
  assert.deepEqual(model.derivations.map((entry) => entry.targetId), [
    'effect:effect_0',
    'effect:effect_1',
    'effect:effect_2',
    'effect:effect_3',
    'effect:effect_4',
  ]);
  assert.equal(model.conclusions.length, 1);
  assert.equal(model.conclusions[0].kind, 'rewrite');
  assert.equal(model.conclusions[0].from?.targetId, 'diff');
  assert.equal(model.conclusions[0].to?.targetId, 'effect:effect_4');
});

test('buildMathViewTypstSource returns the Rust-provided formula source', () => {
  const model = {
    ruleName: 'diff_mul',
    premises: [
      { targetId: 'mul', source: 'a * b', label: 'mul' },
      { targetId: 'diff', source: `(a * b)'(x)`, label: 'diff' },
    ],
    sideConditions: ['guard(a, b)'],
    derivations: [],
    conclusions: [
      {
        id: 'effect_5',
        kind: 'rewrite' as const,
        from: { targetId: 'diff', source: `(a * b)'(x)`, label: 'diff' },
        to: { targetId: 'rhs', source: `a * b'(x) + b * a'(x)`, label: 'rhs' },
      },
    ],
    formulaSource: {
      plain: `frac((a * b)'(x), a * b'(x) + b * a'(x)) quad upright("if") quad guard(a, b)`,
      colored: `#text(fill: rgb("#B86A5B"))[$ frac((a * b)'(x), a * b'(x) + b * a'(x)) quad upright("if") quad guard(a, b) $]`,
    },
  };

  const source = buildMathViewTypstSource(model);

  assert.match(source, /frac\(/);
  assert.match(source, /guard\(a, b\)/);
  assert.equal(source, model.formulaSource.plain);
});

test('resolveSampleSelectionState exits generated-from-egg mode when switching rust demos', () => {
  const next = resolveSampleSelectionState({
    sampleId: 'relation',
    sampleSource: 'fn relation_demo() {}',
  });

  assert.equal(next.selectedId, 'relation');
  assert.equal(next.source, 'fn relation_demo() {}');
  assert.equal(next.transpilerInput, '');
  assert.equal(next.transpilerStatus, 'Paste or edit a .egg program in the left editor.');
});

test('normalizeWebTypstSource keeps fibonacci formulas math-safe', () => {
  assert.equal(normalizeWebTypstSource('fib(x)'), 'upright("fib")(x)');
  assert.equal(normalizeWebTypstSource('fib(x1)'), 'upright("fib")(x_1)');
  assert.equal(normalizeWebTypstSource('fib(x2) = f0 + f1'), 'upright("fib")(x_2) = f_0 + f_1');
  assert.equal(
    normalizeWebTypstSource('#text(fill: rgb("#5F7A8A"))[$ fib(x1) $]'),
    '#text(fill: rgb("#5F7A8A"))[$ upright("fib")(x_1) $]',
  );
});

test('buildMathRenderSources retries normalized math source only after the raw source', () => {
  assert.deepEqual(buildMathRenderSources('fib(x1)'), ['fib(x1)', 'upright("fib")(x_1)']);
  assert.deepEqual(buildMathRenderSources('x^2 + y^2'), ['x^2 + y^2']);
});

test('patternIrToDotWithMode sizes typst-backed nodes from actual svg dimensions without hard minimum clamp', () => {
  const ir: PatternIr = {
    scope: {
      kind: 'pattern_function',
      text_range: { start: 0, end: 10 },
      pattern_range: { start: 0, end: 10 },
      action_range: null,
    },
    nodes: [
      { id: 'f0', kind: 'query', dsl_type: 'fib', label: 'f0: fib', range: { start: 0, end: 4 }, inputs: ['x'] },
      { id: 'x', kind: 'query_leaf', dsl_type: 'Math', label: 'x: Math', range: { start: 5, end: 6 }, inputs: [] },
    ],
    edges: [{ from: 'f0', to: 'x', kind: 'operand', index: 0 }],
    roots: ['f0'],
    constraints: [],
    action_effects: [],
    seed_facts: [],
    display_templates: [],
    typst_templates: [{ variant_name: 'fib', template: 'fib({x})', fields: ['x'] }],
    precedence_templates: [{ variant_name: 'fib', precedence: 90 }],
    diagnostics: [],
  };

  const dot = patternIrToDotWithMode(ir, 'pattern', 'recursive', 'tree-safe', {
    f0: { width: 25.929, height: 10.438 },
  });

  assert.match(dot, /"f0" \[.*width=0\.666.*height=0\.395.*fixedsize=true.*\]/);
});
