import type { PatternIr } from '@eggplant-vscode/ir';

export type WebPreviewFixture = {
  id: string;
  fileName: string;
  description: string;
  dot: string;
  svg: string;
  ir: PatternIr;
  typstSources: Record<string, string>;
};

function buildDemoSvg(title: string, accent: string, nodeLabels: string[]): string {
  const nodes = nodeLabels
    .map(
      (label, index) => `
        <g transform="translate(${24 + index * 118}, 72)">
          <rect x="0" y="0" rx="16" ry="16" width="96" height="48" fill="#ffffff" fill-opacity="0.98" stroke="${accent}" stroke-width="2" />
          <text x="48" y="29" text-anchor="middle" font-family="IBM Plex Sans, sans-serif" font-size="14" fill="#16202b">${label}</text>
        </g>
      `,
    )
    .join('');

  return `
    <svg viewBox="0 0 420 156" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
      <rect width="420" height="156" rx="24" fill="#0f1720" />
      <text x="24" y="34" font-family="IBM Plex Sans, sans-serif" font-size="15" fill="#f8f5ee">${title}</text>
      <path d="M124 96 H142 M242 96 H260" stroke="${accent}" stroke-width="3" stroke-linecap="round" />
      ${nodes}
    </svg>
  `.trim();
}

export const webPreviewFixtures: Record<string, WebPreviewFixture> = {
  pattern_samples: {
    id: 'pattern_samples',
    fileName: 'pattern_samples.rs',
    description:
      'Combined preview fixture with one redundant action insert, one sidebar constraint, and one inline-hidden constraint.',
    dot: [
      'digraph EggplantPattern {',
      '  "sum" -> "l";',
      '  "sum" -> "r";',
      '  "effect:effect_0" [shape=box];',
      '}',
    ].join('\n'),
    svg: buildDemoSvg('pattern_samples.rs', '#ffbf69', ['l', 'sum', 'r']),
    ir: {
      scope: {
        kind: 'pattern_function',
        text_range: { start: 0, end: 120 },
        pattern_range: { start: 0, end: 72 },
        action_range: { start: 73, end: 120 },
      },
      nodes: [
        {
          id: 'l',
          kind: 'query_leaf',
          dsl_type: 'Const',
          label: 'l: Const',
          range: { start: 4, end: 5 },
          inputs: [],
        },
        {
          id: 'r',
          kind: 'query_leaf',
          dsl_type: 'Const',
          label: 'r: Const',
          range: { start: 8, end: 9 },
          inputs: [],
        },
        {
          id: 'sum',
          kind: 'query',
          dsl_type: 'Add',
          label: 'sum: Add(l, r)',
          range: { start: 16, end: 24 },
          inputs: ['l', 'r'],
        },
      ],
      edges: [
        { from: 'sum', to: 'l', kind: 'input', index: 0 },
        { from: 'sum', to: 'r', kind: 'input', index: 1 },
      ],
      roots: ['sum'],
      constraints: [
        {
          id: 'constraint_0',
          source_text: 'custom_pair_constraint(l, r)',
          resolved_text: 'custom_pair_constraint(l, r)',
          referenced_vars: ['l', 'r'],
          range: { start: 26, end: 56 },
        },
        {
          id: 'constraint_1',
          source_text: 'sum.handle().eq(&(l.handle() + r.handle()))',
          resolved_text: 'sum.handle().eq(&(l.handle() + r.handle()))',
          referenced_vars: ['sum', 'l', 'r'],
          range: { start: 57, end: 72 },
        },
      ],
      action_effects: [
        {
          id: 'effect_0',
          effect_id: 'effect_0',
          bound_var: 'duplicate',
          source_text: 'ctx.insert_add(pat.l, pat.r);',
          referenced_pat_vars: ['l', 'r'],
          referenced_action_vars: [],
          range: { start: 80, end: 112 },
        },
      ],
      seed_facts: [],
      display_templates: [],
      typst_templates: [],
      precedence_templates: [],
      diagnostics: [],
    },
    typstSources: {
      sum: 'l + r',
      'effect:effect_0': 'l + r',
    },
  },
  fibonacci_func: {
    id: 'fibonacci_func',
    fileName: 'fibonacci_func.rs',
    description:
      'Function-table style preview fixture without redundant inserts, used to prove the shell stays thin when there are only display/query semantics.',
    dot: [
      'digraph EggplantPattern {',
      '  "n" -> "fib_n";',
      '  "fib_n" -> "fib_next";',
      '}',
    ].join('\n'),
    svg: buildDemoSvg('fibonacci_func.rs', '#5eead4', ['n', 'fib_n', 'fib_next']),
    ir: {
      scope: {
        kind: 'pattern_function',
        text_range: { start: 0, end: 98 },
        pattern_range: { start: 0, end: 74 },
        action_range: { start: 75, end: 98 },
      },
      nodes: [
        {
          id: 'n',
          kind: 'query_leaf',
          dsl_type: 'Nat',
          label: 'n: Nat',
          range: { start: 2, end: 3 },
          inputs: [],
        },
        {
          id: 'fib_n',
          kind: 'query',
          dsl_type: 'Fib',
          label: 'fib_n: Fib(n)',
          range: { start: 10, end: 18 },
          inputs: ['n'],
        },
        {
          id: 'fib_next',
          kind: 'query',
          dsl_type: 'Fib',
          label: 'fib_next: Fib(n + 1)',
          range: { start: 19, end: 32 },
          inputs: ['fib_n'],
        },
      ],
      edges: [
        { from: 'fib_n', to: 'n', kind: 'input', index: 0 },
        { from: 'fib_next', to: 'fib_n', kind: 'input', index: 0 },
      ],
      roots: ['fib_next'],
      constraints: [
        {
          id: 'constraint_0',
          source_text: 'non_negative(n)',
          resolved_text: 'non_negative(n)',
          referenced_vars: ['n'],
          range: { start: 33, end: 49 },
        },
      ],
      action_effects: [],
      seed_facts: [],
      display_templates: [],
      typst_templates: [],
      precedence_templates: [],
      diagnostics: [],
    },
    typstSources: {
      fib_n: 'fib(n)',
      fib_next: 'fib(n + 1)',
    },
  },
  relation: {
    id: 'relation',
    fileName: 'relation.rs',
    description:
      'Relation/path style fixture with one visible relation constraint and one seed fact target in the shared source-target list.',
    dot: [
      'digraph EggplantPattern {',
      '  "start" -> "path";',
      '  "end" -> "path";',
      '  "seed:seed_0" [shape=ellipse];',
      '}',
    ].join('\n'),
    svg: buildDemoSvg('relation.rs', '#7dd3fc', ['start', 'path', 'end']),
    ir: {
      scope: {
        kind: 'pattern_function',
        text_range: { start: 0, end: 110 },
        pattern_range: { start: 0, end: 82 },
        action_range: { start: 83, end: 110 },
      },
      nodes: [
        {
          id: 'start',
          kind: 'query_leaf',
          dsl_type: 'Node',
          label: 'start: Node',
          range: { start: 2, end: 7 },
          inputs: [],
        },
        {
          id: 'end',
          kind: 'query_leaf',
          dsl_type: 'Node',
          label: 'end: Node',
          range: { start: 9, end: 12 },
          inputs: [],
        },
        {
          id: 'path',
          kind: 'query',
          dsl_type: 'Path',
          label: 'path: Path(start, end)',
          range: { start: 16, end: 28 },
          inputs: ['start', 'end'],
        },
      ],
      edges: [
        { from: 'path', to: 'start', kind: 'input', index: 0 },
        { from: 'path', to: 'end', kind: 'input', index: 1 },
      ],
      roots: ['path'],
      constraints: [
        {
          id: 'constraint_0',
          source_text: 'path_cost(start, end)',
          resolved_text: 'path_cost(start, end)',
          referenced_vars: ['start', 'end'],
          range: { start: 31, end: 50 },
        },
      ],
      action_effects: [],
      seed_facts: [
        {
          id: 'seed_0',
          source_text: 'seed_path(start, end)',
          committed_root: 'path',
          referenced_vars: ['start', 'end'],
          range: { start: 88, end: 107 },
        },
      ],
      display_templates: [],
      typst_templates: [],
      precedence_templates: [],
      diagnostics: [],
    },
    typstSources: {
      path: 'path(start, end)',
      'seed:seed_0': 'seed(start, end)',
    },
  },
};
