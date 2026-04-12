import assert from 'node:assert/strict';
import test from 'node:test';

import { patternIrToDotWithMode } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/dot';
import type { PatternIr } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/ir';
import { buildMathViewModel, buildMathViewTypstSource } from './mathView';
import { resolveSampleSelectionState } from './sampleSelection';
import { normalizeWebTypstSource } from './typstNormalization';

test('buildMathViewModel organizes diff_mul into premises, derivations, and rewrite conclusion', () => {
  const ir: PatternIr = {
    scope: {
      kind: 'add_rule_call',
      text_range: { start: 0, end: 220 },
      pattern_range: { start: 20, end: 120 },
      action_range: { start: 121, end: 220 },
    },
    nodes: [
      { id: 'x', kind: 'query_leaf', dsl_type: 'Math', label: 'x: Math', range: { start: 20, end: 21 }, inputs: [] },
      { id: 'a', kind: 'query_leaf', dsl_type: 'Math', label: 'a: Math', range: { start: 22, end: 23 }, inputs: [] },
      { id: 'b', kind: 'query_leaf', dsl_type: 'Math', label: 'b: Math', range: { start: 24, end: 25 }, inputs: [] },
      { id: 'mul', kind: 'query', dsl_type: 'MMul', label: 'mul: MMul', range: { start: 26, end: 38 }, inputs: ['a', 'b'] },
      { id: 'diff', kind: 'query', dsl_type: 'MDiff', label: 'diff: MDiff', range: { start: 39, end: 52 }, inputs: ['x', 'mul'] },
    ],
    edges: [
      { from: 'mul', to: 'a', kind: 'operand', index: 0 },
      { from: 'mul', to: 'b', kind: 'operand', index: 1 },
      { from: 'diff', to: 'x', kind: 'operand', index: 0 },
      { from: 'diff', to: 'mul', kind: 'operand', index: 1 },
    ],
    roots: ['x', 'a', 'b', 'diff'],
    constraints: [
      {
        id: 'constraint_0',
        source_text: 'guard(a, b)',
        resolved_text: 'guard(a, b)',
        referenced_vars: ['a', 'b'],
        range: { start: 53, end: 63 },
      },
    ],
    action_effects: [
      {
        id: 'effect_0',
        effect_id: 'effect@130:150',
        bound_var: 'db',
        source_text: 'ctx.insert_m_diff(pat.x, pat.b)',
        referenced_pat_vars: ['b', 'x'],
        referenced_action_vars: [],
        range: { start: 130, end: 150 },
      },
      {
        id: 'effect_1',
        effect_id: 'effect@151:171',
        bound_var: 'da',
        source_text: 'ctx.insert_m_diff(pat.x, pat.a)',
        referenced_pat_vars: ['a', 'x'],
        referenced_action_vars: [],
        range: { start: 151, end: 171 },
      },
      {
        id: 'effect_2',
        effect_id: 'effect@172:190',
        bound_var: 'a_db',
        source_text: 'ctx.insert_m_mul(pat.a, db)',
        referenced_pat_vars: ['a'],
        referenced_action_vars: ['db'],
        range: { start: 172, end: 190 },
      },
      {
        id: 'effect_3',
        effect_id: 'effect@191:209',
        bound_var: 'b_da',
        source_text: 'ctx.insert_m_mul(pat.b, da)',
        referenced_pat_vars: ['b'],
        referenced_action_vars: ['da'],
        range: { start: 191, end: 209 },
      },
      {
        id: 'effect_4',
        effect_id: 'effect@210:228',
        bound_var: 'rhs',
        source_text: 'ctx.insert_m_add(a_db, b_da)',
        referenced_pat_vars: [],
        referenced_action_vars: ['a_db', 'b_da'],
        range: { start: 210, end: 228 },
      },
      {
        id: 'effect_5',
        effect_id: 'effect@229:240',
        bound_var: null,
        source_text: 'ctx.union(pat.diff, rhs)',
        referenced_pat_vars: ['diff'],
        referenced_action_vars: ['rhs'],
        range: { start: 229, end: 240 },
      },
    ],
    seed_facts: [],
    display_templates: [],
    typst_templates: [
      { variant_name: 'MMul', template: '{a} * {b}', fields: ['a', 'b'] },
      { variant_name: 'MDiff', template: '{f}\'({x})', fields: ['x', 'f'] },
      { variant_name: 'MAdd', template: '{a} + {b}', fields: ['a', 'b'] },
    ],
    precedence_templates: [
      { variant_name: 'MMul', precedence: 60 },
      { variant_name: 'MDiff', precedence: 90 },
      { variant_name: 'MAdd', precedence: 50 },
    ],
    diagnostics: [],
  };

  const model = buildMathViewModel(ir, 'MyTxMath::add_rule("diff_mul", rs, || { ... }, |ctx, pat| { ... })');

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

test('buildMathViewTypstSource produces one multiline inference-rule formula', () => {
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
  };

  const source = buildMathViewTypstSource(model);

  assert.match(source, /frac\(/);
  assert.match(source, / \\ /);
  assert.match(source, /arrow\.r\.double/);
  assert.match(source, /guard\(a, b\)/);
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

  assert.match(dot, /"f0" \[.*width=0\.666.*height=0\.395.*\]/);
});
