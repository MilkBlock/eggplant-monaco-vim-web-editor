import type { PatternIr } from '@eggplant-vscode/ir';

export interface MathViewEntry {
  targetId: string;
  source: string;
  label: string;
}

export interface MathViewConclusion {
  id: string;
  kind: 'rewrite' | 'derive';
  from?: MathViewEntry;
  to?: MathViewEntry;
  entry?: MathViewEntry;
}

export interface MathViewModel {
  ruleName: string;
  premises: MathViewEntry[];
  sideConditions: string[];
  derivations: MathViewEntry[];
  conclusions: MathViewConclusion[];
  formulaSource: {
    plain: string;
    colored: string;
  };
}

type ExtractedMathViewEntry = {
  target_id: string;
  label: string;
  plain_source: string;
  colored_source: string;
};

type ExtractedMathViewConclusion =
  | {
      id: string;
      kind: 'rewrite';
      from: ExtractedMathViewEntry;
      to: ExtractedMathViewEntry;
    }
  | {
      id: string;
      kind: 'derive';
      entry: ExtractedMathViewEntry;
    };

type ExtractedMathView = {
  rule_name: string;
  premises: ExtractedMathViewEntry[];
  side_conditions: string[];
  derivations: ExtractedMathViewEntry[];
  conclusions: ExtractedMathViewConclusion[];
  formula_source: {
    plain: string;
    colored: string;
  };
};

function fallbackRuleName(ir: PatternIr): string {
  return `rule@${ir.scope.text_range.start}`;
}

function adaptEntry(entry: ExtractedMathViewEntry): MathViewEntry {
  return {
    targetId: entry.target_id,
    source: entry.plain_source,
    label: entry.label,
  };
}

function adaptConclusion(conclusion: ExtractedMathViewConclusion): MathViewConclusion {
  if (conclusion.kind === 'rewrite') {
    return {
      id: conclusion.id,
      kind: 'rewrite',
      from: adaptEntry(conclusion.from),
      to: adaptEntry(conclusion.to),
    };
  }
  return {
    id: conclusion.id,
    kind: 'derive',
    entry: adaptEntry(conclusion.entry),
  };
}

export function buildMathViewModel(ir: PatternIr, _source?: string): MathViewModel {
  const mathView = (ir as PatternIr & { math_view?: ExtractedMathView | null }).math_view;
  if (!mathView) {
    return {
      ruleName: fallbackRuleName(ir),
      premises: [],
      sideConditions: [],
      derivations: [],
      conclusions: [],
      formulaSource: {
        plain: 'frac(upright("no matched premise"), upright("no conclusion")) quad upright("if") quad upright("None")',
        colored: 'frac(upright("no matched premise"), upright("no conclusion")) quad upright("if") quad upright("None")',
      },
    };
  }

  return {
    ruleName: mathView.rule_name,
    premises: mathView.premises.map(adaptEntry),
    sideConditions: mathView.side_conditions,
    derivations: mathView.derivations.map(adaptEntry),
    conclusions: mathView.conclusions.map(adaptConclusion),
    formulaSource: mathView.formula_source,
  };
}

export function buildMathViewTypstSource(
  model: MathViewModel,
  colorMode: 'plain' | 'colored' = 'plain',
): string {
  return colorMode === 'colored' ? model.formulaSource.colored : model.formulaSource.plain;
}
