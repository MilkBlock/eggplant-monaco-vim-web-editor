import { collectTypstReplacementSources, compactConstraintLabel } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/dot';
import type { ActionEffect, PatternIr, PatternNode, TextSpan } from '../vendor/eggplant_pattern_view_plugin/eggplant-pattern-vscode/src/ir';

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
}

function parseRuleNameFromSource(source: string, range: TextSpan): string {
  const slice = source.slice(range.start, range.end);
  const match = slice.match(/add_rule(?:_with_hook)?\(\s*"([^"]+)"/);
  return match?.[1] ?? `rule@${range.start}`;
}

function entrySortOrder(ir: PatternIr, targetId: string): number {
  if (targetId.startsWith('effect:')) {
    return ir.action_effects.find((effect) => `effect:${effect.id}` === targetId)?.range.start ?? Number.MAX_SAFE_INTEGER;
  }
  return ir.nodes.find((node) => node.id === targetId)?.range.start ?? Number.MAX_SAFE_INTEGER;
}

function buildEntryLabel(targetId: string, node?: PatternNode, effect?: ActionEffect): string {
  if (effect?.bound_var) {
    return effect.bound_var;
  }
  if (node?.dsl_type) {
    return `${node.id}: ${node.dsl_type}`;
  }
  return targetId;
}

function buildEntry(targetId: string, source: string, ir: PatternIr): MathViewEntry {
  const node = ir.nodes.find((entry) => entry.id === targetId);
  const effect = ir.action_effects.find((entry) => `effect:${entry.id}` === targetId);
  return {
    targetId,
    source,
    label: buildEntryLabel(targetId, node, effect),
  };
}

function parseUnionConclusion(effect: ActionEffect): { patternVar: string; actionVar: string } | null {
  const match = effect.source_text.match(
    /(?:[A-Za-z_][A-Za-z0-9_]*\.)?union\(\s*(?:pat|matched)\.([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\)/
  );
  if (match) {
    return {
      patternVar: match[1],
      actionVar: match[2],
    };
  }
  if (effect.referenced_pat_vars.length === 1 && effect.referenced_action_vars.length === 1) {
    return {
      patternVar: effect.referenced_pat_vars[0],
      actionVar: effect.referenced_action_vars[0],
    };
  }
  return null;
}

export function buildMathViewModel(ir: PatternIr, source: string): MathViewModel {
  const patternEntries = collectTypstReplacementSources(ir, 'pattern', 'recursive', 'tree-safe')
    .sort((left, right) => entrySortOrder(ir, left.targetId) - entrySortOrder(ir, right.targetId))
    .map((entry) => buildEntry(entry.targetId, entry.source, ir));

  const actionEntries = collectTypstReplacementSources(ir, 'action', 'recursive', 'tree-safe')
    .sort((left, right) => entrySortOrder(ir, left.targetId) - entrySortOrder(ir, right.targetId))
    .map((entry) => buildEntry(entry.targetId, entry.source, ir));

  const patternById = new Map(patternEntries.map((entry) => [entry.targetId, entry]));
  const actionByBoundVar = new Map(
    ir.action_effects
      .filter((effect) => effect.bound_var)
      .map((effect) => [effect.bound_var as string, actionEntries.find((entry) => entry.targetId === `effect:${effect.id}`)])
      .filter((entry): entry is [string, MathViewEntry] => Boolean(entry[1]))
  );

  const conclusions: MathViewConclusion[] = [];
  for (const effect of ir.action_effects) {
    const union = parseUnionConclusion(effect);
    if (!union) {
      continue;
    }
    const from = patternById.get(union.patternVar);
    const to = actionByBoundVar.get(union.actionVar);
    if (!from || !to) {
      continue;
    }
    conclusions.push({
      id: effect.id,
      kind: 'rewrite',
      from,
      to,
    });
  }

  if (conclusions.length === 0 && actionEntries.length > 0) {
    const consumedByMaterial = new Set<string>();
    for (const effect of ir.action_effects) {
      const hasMaterializedEntry = actionEntries.some((entry) => entry.targetId === `effect:${effect.id}`);
      if (!hasMaterializedEntry) {
        continue;
      }
      for (const actionVar of effect.referenced_action_vars) {
        consumedByMaterial.add(actionVar);
      }
    }

    for (const effect of ir.action_effects) {
      if (!effect.bound_var || consumedByMaterial.has(effect.bound_var)) {
        continue;
      }
      const entry = actionEntries.find((candidate) => candidate.targetId === `effect:${effect.id}`);
      if (!entry) {
        continue;
      }
      conclusions.push({
        id: effect.id,
        kind: 'derive',
        entry,
      });
    }
  }

  return {
    ruleName: parseRuleNameFromSource(source, ir.scope.text_range),
    premises: patternEntries,
    sideConditions: ir.constraints.map((constraint) =>
      compactConstraintLabel(constraint.source_text, constraint.resolved_text)
    ),
    derivations: actionEntries,
    conclusions,
  };
}
