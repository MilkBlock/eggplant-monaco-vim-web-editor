export type PersistedSnapshotSortDecl = {
  sort_id: number;
  name: string;
  kind: string;
  metadata?: unknown;
};

export type PersistedSnapshotFunctionDecl = {
  op_id: number;
  name: string;
  input_sort_ids: number[];
  output_sort_id: number;
  is_relation: boolean;
  merge?: string | null;
  cost?: number | null;
  metadata?: {
    typst_template?: string | null;
    precedence?: number | null;
    [key: string]: unknown;
  } | null;
};

export type PersistedSnapshotValue =
  | {
      kind: 'lit';
      sort_id: number;
      value: {
        tag: string;
        value: string;
        machine_value?: unknown;
      };
    }
  | {
      kind: 'ref';
      sort_id: number;
      logical_id: string;
    };

export type PersistedSnapshotFact = {
  op_id: number;
  inputs: PersistedSnapshotValue[];
};

export type PersistedSnapshotFunctionRow = {
  op_id: number;
  inputs: PersistedSnapshotValue[];
  output: PersistedSnapshotValue;
};

export type PersistedSnapshotUnion = {
  sort_id: number;
  lhs: PersistedSnapshotValue;
  rhs: PersistedSnapshotValue;
  reason?: string | null;
};

export type PersistedSnapshotRun = {
  ruleset_id: number;
  sequence_no: number;
  until?: string | null;
  node_limit?: number | null;
  time_limit_ms?: number | null;
};

export type PersistedSnapshotValueId = {
  logical_id: string;
  sort_id: number;
  debug_value?: string | null;
};

export type PersistedSnapshotEqClassMemberRow = {
  op_id: number;
  inputs: PersistedSnapshotValue[];
};

export type PersistedSnapshotEqClass = {
  sort_id: number;
  logical_id: string;
  debug_value?: string | null;
  members: PersistedSnapshotEqClassMemberRow[];
};

export type PersistedSnapshotEqClassPayload = {
  semantics: 'inspect_only';
  classes: PersistedSnapshotEqClass[];
};

export type PersistedSnapshot = {
  snapshot_version: number;
  format: string;
  profile: string;
  producer?: {
    crate_name: string;
    version: string;
  } | null;
  dictionary: {
    sorts: string[];
    ops: string[];
    symbols?: string[];
    strings?: string[];
  };
  schema: {
    sort_decls: PersistedSnapshotSortDecl[];
    function_decls: PersistedSnapshotFunctionDecl[];
    constructor_decls: PersistedSnapshotFunctionDecl[];
    ruleset_decls: Array<{ ruleset_id: number; name: string }>;
  };
  state: {
    facts: PersistedSnapshotFact[];
    function_rows: PersistedSnapshotFunctionRow[];
    unions: PersistedSnapshotUnion[];
    runs: PersistedSnapshotRun[];
    fresh_id_cursor?: number | null;
  };
  restore_mapping: {
    value_ids: PersistedSnapshotValueId[];
    notes: string[];
  };
  eq_class_payload?: PersistedSnapshotEqClassPayload | null;
  diagnostics: Array<{
    code: string;
    message: string;
    path?: string | null;
  }>;
};

type SnapshotClassNode = {
  id: string;
  sortName: string;
  memberLabels: string[];
  memberCount: number;
};

type SnapshotOpNode = {
  id: string;
  label: string;
  detail: string;
};

export type SnapshotInspectorModel = {
  snapshot: PersistedSnapshot;
  rowsDot: string;
  eqClassDot: string | null;
  typstDot: string | null;
  typstSources: Record<string, string>;
  classNodes: SnapshotClassNode[];
  opNodes: SnapshotOpNode[];
  eqClasses: PersistedSnapshotEqClass[];
  stats: {
    classCount: number;
    eqClassCount: number;
    valueIdCount: number;
    factCount: number;
    functionRowCount: number;
    unionCount: number;
    runCount: number;
    diagnosticCount: number;
  };
};

function quote(value: string): string {
  return JSON.stringify(value);
}

function valueKey(value: PersistedSnapshotValue): string {
  if (value.kind === 'ref') {
    return `ref:${value.sort_id}:${value.logical_id}`;
  }
  return `lit:${value.sort_id}:${value.value.tag}:${value.value.value}`;
}

function opName(opId: number, opsById: Map<number, PersistedSnapshotFunctionDecl>): string {
  return opsById.get(opId)?.name ?? `op#${opId}`;
}

type TypstRenderedTerm = {
  text: string;
  precedence: number;
};

function placeholderOrder(template: string): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];
  for (const match of template.matchAll(/\{([^}]+)\}/g)) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      ordered.push(key);
    }
  }
  return ordered;
}

function renderTypstTemplate(template: string, args: TypstRenderedTerm[], precedence: number): string {
  const placeholders = placeholderOrder(template);
  let rendered = template;
  placeholders.forEach((placeholder, index) => {
    const arg = args[index];
    const text = arg
      ? arg.precedence < precedence
        ? `(${arg.text})`
        : arg.text
      : placeholder;
    rendered = rendered.replace(new RegExp(`\\{${placeholder}\\}`, 'g'), text);
  });
  return rendered;
}

function unionFind(values: string[]): Map<string, string> {
  const parent = new Map<string, string>();
  for (const value of values) {
    parent.set(value, value);
  }
  const find = (value: string): string => {
    const current = parent.get(value) ?? value;
    if (current === value) {
      parent.set(value, current);
      return current;
    }
    const root = find(current);
    parent.set(value, root);
    return root;
  };
  const unite = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      parent.set(rightRoot, leftRoot);
    }
  };
  (unionFind as unknown as { unite?: typeof unite; find?: typeof find }).unite = unite;
  (unionFind as unknown as { unite?: typeof unite; find?: typeof find }).find = find;
  return parent;
}

export function buildSnapshotInspectorModel(snapshot: PersistedSnapshot): SnapshotInspectorModel {
  const sortNames = new Map(snapshot.schema.sort_decls.map((decl) => [decl.sort_id, decl.name] as const));
  const opsById = new Map(
    [...snapshot.schema.function_decls, ...snapshot.schema.constructor_decls].map((decl) => [decl.op_id, decl] as const),
  );
  const debugByLogicalId = new Map(
    snapshot.restore_mapping.value_ids.map((valueId) => [
      valueId.logical_id,
      valueId.debug_value ?? `${sortNames.get(valueId.sort_id) ?? 'sort'}:${valueId.logical_id}`,
    ]),
  );

  const allKeys = new Set<string>();
  const rememberValue = (value: PersistedSnapshotValue) => {
    allKeys.add(valueKey(value));
  };
  snapshot.restore_mapping.value_ids.forEach((entry) =>
    allKeys.add(`ref:${entry.sort_id}:${entry.logical_id}`),
  );
  snapshot.state.facts.forEach((fact) => fact.inputs.forEach(rememberValue));
  snapshot.state.function_rows.forEach((row) => {
    row.inputs.forEach(rememberValue);
    rememberValue(row.output);
  });
  snapshot.state.unions.forEach((union) => {
    rememberValue(union.lhs);
    rememberValue(union.rhs);
  });

  const uf = unionFind(Array.from(allKeys));
  const find = (value: string) => {
    const parent = uf.get(value) ?? value;
    if (parent === value) {
      return value;
    }
    let root = parent;
    while ((uf.get(root) ?? root) !== root) {
      root = uf.get(root) ?? root;
    }
    return root;
  };
  const unite = (left: string, right: string) => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot !== rightRoot) {
      uf.set(rightRoot, leftRoot);
    }
  };
  snapshot.state.unions.forEach((union) => {
    unite(valueKey(union.lhs), valueKey(union.rhs));
  });

  const classMembers = new Map<string, string[]>();
  Array.from(allKeys).forEach((key) => {
    const root = find(key);
    const members = classMembers.get(root) ?? [];
    members.push(key);
    classMembers.set(root, members);
  });

  const classIdByValueKey = new Map<string, string>();
  const classNodes: SnapshotClassNode[] = Array.from(classMembers.entries()).map(([, members], index) => {
    const memberLabels = members.map((member) => {
      if (member.startsWith('ref:')) {
        const [, sortIdText, logicalId] = member.split(':');
        return debugByLogicalId.get(logicalId) ?? `${sortNames.get(Number(sortIdText)) ?? 'sort'}:${logicalId}`;
      }
      const [, sortIdText, tag, ...rest] = member.split(':');
      return `${sortNames.get(Number(sortIdText)) ?? 'sort'} ${tag} ${rest.join(':')}`;
    });
    const sortName = members[0]?.startsWith('ref:')
      ? sortNames.get(Number(members[0].split(':')[1])) ?? 'sort'
      : sortNames.get(Number(members[0]?.split(':')[1] ?? -1)) ?? 'sort';
    const id = `class:${index}`;
    members.forEach((member) => classIdByValueKey.set(member, id));
    return {
      id,
      sortName,
      memberLabels,
      memberCount: members.length,
    };
  });

  const opNodes: SnapshotOpNode[] = [];
  const lines = [
    'digraph PersistedSnapshot {',
    '  rankdir=LR;',
    '  graph [pad=0.3, nodesep=0.45, ranksep=0.7];',
    '  node [shape=box, style="rounded,filled", fillcolor="#f6f2e8", color="#6b5b3e", fontname="Helvetica"];',
    '  edge [color="#7a7468"];',
  ];

  classNodes.forEach((classNode) => {
    const preview = classNode.memberLabels.slice(0, 3).join('\\n');
    const suffix = classNode.memberCount > 3 ? `\\n... +${classNode.memberCount - 3} more` : '';
    lines.push(
      `  ${quote(classNode.id)} [label=${quote(`${classNode.sortName}\\n${preview}${suffix}`)}, shape=ellipse, fillcolor="#fff7df", color="#c26d00"];`,
    );
  });

  snapshot.state.function_rows.forEach((row, index) => {
    const opId = `row:${index}`;
    const label = opName(row.op_id, opsById);
    const detail = `${label}(${row.inputs.length})`;
    opNodes.push({ id: opId, label, detail });
    lines.push(`  ${quote(opId)} [label=${quote(`${label}\\nfunction row`)}, fillcolor="#e9f2ff", color="#4a6fa5"];`);
    row.inputs.forEach((input, inputIndex) => {
      const classId = classIdByValueKey.get(valueKey(input));
      if (classId) {
        lines.push(`  ${quote(classId)} -> ${quote(opId)} [label=${quote(String(inputIndex))}];`);
      }
    });
    const outputClassId = classIdByValueKey.get(valueKey(row.output));
    if (outputClassId) {
      lines.push(`  ${quote(opId)} -> ${quote(outputClassId)} [label="out"];`);
    }
  });

  snapshot.state.facts.forEach((fact, index) => {
    const opId = `fact:${index}`;
    const label = opName(fact.op_id, opsById);
    const detail = `${label}(${fact.inputs.length})`;
    opNodes.push({ id: opId, label, detail });
    lines.push(`  ${quote(opId)} [label=${quote(`${label}\\nrelation fact`)}, fillcolor="#eef8ef", color="#4a7d63"];`);
    fact.inputs.forEach((input, inputIndex) => {
      const classId = classIdByValueKey.get(valueKey(input));
      if (classId) {
        lines.push(`  ${quote(classId)} -> ${quote(opId)} [label=${quote(String(inputIndex))}];`);
      }
    });
  });

  snapshot.state.unions.forEach((union, index) => {
    const unionId = `union:${index}`;
    lines.push(`  ${quote(unionId)} [label=${quote(`union\\n${union.reason ?? 'equivalence'}`)}, shape=note, fillcolor="#fff0e8", color="#a55d35"];`);
    const leftClassId = classIdByValueKey.get(valueKey(union.lhs));
    const rightClassId = classIdByValueKey.get(valueKey(union.rhs));
    if (leftClassId) {
      lines.push(`  ${quote(leftClassId)} -> ${quote(unionId)} [style=dashed, label="lhs"];`);
    }
    if (rightClassId) {
      lines.push(`  ${quote(rightClassId)} -> ${quote(unionId)} [style=dashed, label="rhs"];`);
    }
  });

  lines.push('}');

  const eqClassPayload = snapshot.eq_class_payload ?? null;
  const eqClassesByLogicalId = new Map(eqClassPayload?.classes.map((entry) => [entry.logical_id, entry] as const) ?? []);
  const typstMetadataByOpId = new Map(
    [...snapshot.schema.function_decls, ...snapshot.schema.constructor_decls].map((decl) => [
      decl.op_id,
      {
        name: decl.name,
        typstTemplate: decl.metadata?.typst_template ?? null,
        precedence: decl.metadata?.precedence ?? Number.MAX_SAFE_INTEGER,
      },
    ] as const),
  );

  const renderValueTypst = (
    value: PersistedSnapshotValue,
    visiting: Set<string>,
  ): TypstRenderedTerm => {
    if (value.kind === 'lit') {
      return {
        text: value.value.value,
        precedence: Number.MAX_SAFE_INTEGER,
      };
    }

    const eqClass = eqClassesByLogicalId.get(value.logical_id);
    if (!eqClass || eqClass.members.length === 0) {
      return {
        text: debugByLogicalId.get(value.logical_id) ?? value.logical_id,
        precedence: Number.MAX_SAFE_INTEGER,
      };
    }
    if (visiting.has(value.logical_id)) {
      return {
        text: eqClass.debug_value ?? value.logical_id,
        precedence: Number.MAX_SAFE_INTEGER,
      };
    }

    visiting.add(value.logical_id);
    const member = eqClass.members[0];
    const metadata = typstMetadataByOpId.get(member.op_id);
    const childTerms = member.inputs.map((input) => renderValueTypst(input, visiting));
    visiting.delete(value.logical_id);

    if (metadata?.typstTemplate) {
      return {
        text: renderTypstTemplate(metadata.typstTemplate, childTerms, metadata.precedence),
        precedence: metadata.precedence,
      };
    }

    return {
      text: `${metadata?.name ?? `op#${member.op_id}`}(${childTerms.map((term) => term.text).join(', ')})`,
      precedence: metadata?.precedence ?? Number.MAX_SAFE_INTEGER,
    };
  };
  const eqClassLines = eqClassPayload
    ? [
        'digraph PersistedSnapshotEqClass {',
        '  rankdir=LR;',
        '  graph [pad=0.3, nodesep=0.45, ranksep=0.7];',
        '  node [shape=box, style="rounded,filled", fillcolor="#f6f2e8", color="#6b5b3e", fontname="Helvetica"];',
        '  edge [color="#7a7468"];',
      ]
    : null;

  if (eqClassPayload && eqClassLines) {
    eqClassPayload.classes.forEach((eqClass, index) => {
      const classId = `eqclass:${index}`;
      const classLabel = eqClass.debug_value ?? `${sortNames.get(eqClass.sort_id) ?? 'sort'}:${eqClass.logical_id}`;
      eqClassLines.push(
        `  ${quote(classId)} [label=${quote(`${sortNames.get(eqClass.sort_id) ?? 'sort'}\\n${classLabel}\\n${eqClass.members.length} member row(s)`)}, shape=ellipse, fillcolor="#fff7df", color="#c26d00"];`,
      );

      eqClass.members.forEach((member, memberIndex) => {
        const memberId = `${classId}:member:${memberIndex}`;
        const label = opName(member.op_id, opsById);
        eqClassLines.push(
          `  ${quote(memberId)} [label=${quote(`${label}\\nmember row`)}, fillcolor="#e9f2ff", color="#4a6fa5"];`,
        );
        eqClassLines.push(`  ${quote(classId)} -> ${quote(memberId)} [label="contains"];`);
        member.inputs.forEach((input, inputIndex) => {
          const sourceClass = eqClassPayload.classes.findIndex((candidate) => candidate.logical_id === (input.kind === 'ref' ? input.logical_id : ''));
          if (sourceClass >= 0) {
            eqClassLines.push(`  ${quote(`eqclass:${sourceClass}`)} -> ${quote(memberId)} [label=${quote(String(inputIndex))}];`);
          }
        });
      });
    });
    eqClassLines.push('}');
  }

  const typstSources: Record<string, string> = {};
  const typstLines = eqClassPayload
    ? [
        'digraph PersistedSnapshotTypst {',
        '  rankdir=LR;',
        '  graph [pad=0.3, nodesep=0.45, ranksep=0.7];',
        '  node [shape=box, style="filled", fixedsize=true, width=1.35, height=1.35, margin=0, fillcolor="#f6f2e8", color="#6b5b3e", fontname="Helvetica"];',
        '  edge [color="#7a7468"];',
      ]
    : null;

  if (eqClassPayload && typstLines) {
    eqClassPayload.classes.forEach((eqClass, index) => {
      const classId = `typst-class:${index}`;
      const formula = renderValueTypst(
        {
          kind: 'ref',
          sort_id: eqClass.sort_id,
          logical_id: eqClass.logical_id,
        },
        new Set(),
      );
      typstSources[classId] = formula.text;
      const fallbackLabel = eqClass.debug_value ?? eqClass.logical_id;
      typstLines.push(
        `  ${quote(classId)} [label=${quote(fallbackLabel)}, fillcolor="#fff7df", color="#c26d00"];`,
      );

      const member = eqClass.members[0];
      if (!member) {
        return;
      }
      member.inputs.forEach((input, inputIndex) => {
        if (input.kind !== 'ref') {
          return;
        }
        const sourceClassIndex = eqClassPayload.classes.findIndex((candidate) => candidate.logical_id === input.logical_id);
        if (sourceClassIndex >= 0) {
          typstLines.push(`  ${quote(`typst-class:${sourceClassIndex}`)} -> ${quote(classId)} [label=${quote(String(inputIndex))}];`);
        }
      });
    });
    typstLines.push('}');
  }

  return {
    snapshot,
    rowsDot: lines.join('\n'),
    eqClassDot: eqClassLines ? eqClassLines.join('\n') : null,
    typstDot: typstLines ? typstLines.join('\n') : null,
    typstSources,
    classNodes,
    opNodes,
    eqClasses: eqClassPayload?.classes ?? [],
    stats: {
      classCount: classNodes.length,
      eqClassCount: eqClassPayload?.classes.length ?? 0,
      valueIdCount: snapshot.restore_mapping.value_ids.length,
      factCount: snapshot.state.facts.length,
      functionRowCount: snapshot.state.function_rows.length,
      unionCount: snapshot.state.unions.length,
      runCount: snapshot.state.runs.length,
      diagnosticCount: snapshot.diagnostics.length,
    },
  };
}
