import type { PatternIr } from "@eggplant-vscode/ir";

export type WebRuleScope = {
  id: string;
  label: string;
  ir: PatternIr;
};

export const webRuleScopesBySampleId: Record<string, WebRuleScope[]> = {
  "pattern_samples": [
    {
      "id": "demo",
      "label": "Demo Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 101,
            "end": 531
          },
          "pattern_range": {
            "start": 158,
            "end": 404
          },
          "action_range": {
            "start": 414,
            "end": 524
          }
        },
        "nodes": [
          {
            "id": "l",
            "kind": "query",
            "dsl_type": "Const",
            "label": "l: Const",
            "range": {
              "start": 175,
              "end": 198
            },
            "inputs": []
          },
          {
            "id": "r",
            "kind": "query",
            "dsl_type": "Const",
            "label": "r: Const",
            "range": {
              "start": 211,
              "end": 234
            },
            "inputs": []
          },
          {
            "id": "p",
            "kind": "query",
            "dsl_type": "Add",
            "label": "p: Add",
            "range": {
              "start": 247,
              "end": 274
            },
            "inputs": [
              "l",
              "r"
            ]
          }
        ],
        "edges": [
          {
            "from": "p",
            "to": "l",
            "kind": "operand",
            "index": 0
          },
          {
            "from": "p",
            "to": "r",
            "kind": "operand",
            "index": 1
          }
        ],
        "roots": [
          "l",
          "r",
          "p"
        ],
        "constraints": [
          {
            "id": "constraint_0",
            "source_text": "eq",
            "resolved_text": "x1.handle().eq(&(x.handle() + (&1_i64).as_handle()))",
            "referenced_vars": [],
            "range": {
              "start": 391,
              "end": 393
            }
          }
        ],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@454:473",
            "bound_var": "op_value",
            "source_text": "ctx.insert_const(3)",
            "referenced_pat_vars": [],
            "referenced_action_vars": [],
            "range": {
              "start": 454,
              "end": 473
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@487:513",
            "bound_var": null,
            "source_text": "ctx.union(pat.p, op_value)",
            "referenced_pat_vars": [
              "p"
            ],
            "referenced_action_vars": [
              "op_value"
            ],
            "range": {
              "start": 487,
              "end": 513
            }
          }
        ],
        "seed_facts": [
          {
            "id": "seed_0",
            "source_text": "expr.commit()",
            "committed_root": "expr",
            "referenced_vars": [
              "expr"
            ],
            "range": {
              "start": 82,
              "end": 95
            }
          }
        ],
        "display_templates": [
          {
            "variant_name": "MDiff",
            "template": "{x} + {f}",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "integ {f} {x}",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "typst_templates": [
          {
            "variant_name": "MDiff",
            "template": "diff ${x}, {f}$",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "${f}, {x}$",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "precedence_templates": [],
        "diagnostics": []
      }
    },
    {
      "id": "display_demo",
      "label": "Display Demo Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 940,
            "end": 1350
          },
          "pattern_range": {
            "start": 1005,
            "end": 1204
          },
          "action_range": {
            "start": 1214,
            "end": 1343
          }
        },
        "nodes": [
          {
            "id": "xxx",
            "kind": "query_leaf",
            "dsl_type": "DisplayMath",
            "label": "xxx: DisplayMath",
            "range": {
              "start": 1022,
              "end": 1058
            },
            "inputs": []
          },
          {
            "id": "f",
            "kind": "query_leaf",
            "dsl_type": "DisplayMath",
            "label": "f: DisplayMath",
            "range": {
              "start": 1071,
              "end": 1105
            },
            "inputs": []
          },
          {
            "id": "diff",
            "kind": "query",
            "dsl_type": "MDiff",
            "label": "diff: MDiff",
            "range": {
              "start": 1118,
              "end": 1152
            },
            "inputs": [
              "xxx",
              "f"
            ]
          }
        ],
        "edges": [
          {
            "from": "diff",
            "to": "xxx",
            "kind": "operand",
            "index": 0
          },
          {
            "from": "diff",
            "to": "f",
            "kind": "operand",
            "index": 1
          }
        ],
        "roots": [
          "xxx",
          "f",
          "diff"
        ],
        "constraints": [],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@1254:1289",
            "bound_var": "integral",
            "source_text": "ctx.insert_m_integral(pat.f, pat.x)",
            "referenced_pat_vars": [
              "f"
            ],
            "referenced_action_vars": [],
            "range": {
              "start": 1254,
              "end": 1289
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@1303:1332",
            "bound_var": null,
            "source_text": "ctx.union(pat.diff, integral)",
            "referenced_pat_vars": [
              "diff"
            ],
            "referenced_action_vars": [
              "integral"
            ],
            "range": {
              "start": 1303,
              "end": 1332
            }
          }
        ],
        "seed_facts": [],
        "display_templates": [
          {
            "variant_name": "MDiff",
            "template": "{x} + {f}",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "integ {f} {x}",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "typst_templates": [
          {
            "variant_name": "MDiff",
            "template": "diff ${x}, {f}$",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "${f}, {x}$",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "precedence_templates": [],
        "diagnostics": []
      }
    },
    {
      "id": "demo_assert_block",
      "label": "Assert Block Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 1646,
            "end": 2256
          },
          "pattern_range": {
            "start": 1716,
            "end": 2133
          },
          "action_range": {
            "start": 2143,
            "end": 2249
          }
        },
        "nodes": [
          {
            "id": "l",
            "kind": "query",
            "dsl_type": "Const",
            "label": "l: Const",
            "range": {
              "start": 1733,
              "end": 1756
            },
            "inputs": []
          },
          {
            "id": "r",
            "kind": "query",
            "dsl_type": "Const",
            "label": "r: Const",
            "range": {
              "start": 1769,
              "end": 1792
            },
            "inputs": []
          },
          {
            "id": "p",
            "kind": "query",
            "dsl_type": "Add",
            "label": "p: Add",
            "range": {
              "start": 1805,
              "end": 1832
            },
            "inputs": [
              "l",
              "r"
            ]
          }
        ],
        "edges": [
          {
            "from": "p",
            "to": "l",
            "kind": "operand",
            "index": 0
          },
          {
            "from": "p",
            "to": "r",
            "kind": "operand",
            "index": 1
          }
        ],
        "roots": [
          "l",
          "r",
          "p"
        ],
        "constraints": [
          {
            "id": "constraint_0",
            "source_text": "l_r_eq",
            "resolved_text": "l.handle().eq(&r.handle())",
            "referenced_vars": [
              "l",
              "r"
            ],
            "range": {
              "start": 2116,
              "end": 2122
            }
          }
        ],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@2181:2200",
            "bound_var": "folded",
            "source_text": "ctx.insert_const(6)",
            "referenced_pat_vars": [],
            "referenced_action_vars": [],
            "range": {
              "start": 2181,
              "end": 2200
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@2214:2238",
            "bound_var": null,
            "source_text": "ctx.union(pat.p, folded)",
            "referenced_pat_vars": [
              "p"
            ],
            "referenced_action_vars": [
              "folded"
            ],
            "range": {
              "start": 2214,
              "end": 2238
            }
          }
        ],
        "seed_facts": [
          {
            "id": "seed_0",
            "source_text": "expr2.commit()",
            "committed_root": "expr2",
            "referenced_vars": [
              "expr2"
            ],
            "range": {
              "start": 1626,
              "end": 1640
            }
          }
        ],
        "display_templates": [
          {
            "variant_name": "MDiff",
            "template": "{x} + {f}",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "integ {f} {x}",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "typst_templates": [
          {
            "variant_name": "MDiff",
            "template": "diff ${x}, {f}$",
            "fields": [
              "x",
              "f"
            ]
          },
          {
            "variant_name": "MIntegral",
            "template": "${f}, {x}$",
            "fields": [
              "f",
              "x"
            ]
          }
        ],
        "precedence_templates": [],
        "diagnostics": []
      }
    }
  ],
  "fibonacci_func": [
    {
      "id": "fib_seed",
      "label": "Fibonacci Seed Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 870,
            "end": 1119
          },
          "pattern_range": {
            "start": 936,
            "end": 1017
          },
          "action_range": {
            "start": 1027,
            "end": 1112
          }
        },
        "nodes": [],
        "edges": [],
        "roots": [
          "Unit"
        ],
        "constraints": [],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@1053:1070",
            "bound_var": null,
            "source_text": "ctx.set_fib(0, 0)",
            "referenced_pat_vars": [],
            "referenced_action_vars": [],
            "range": {
              "start": 1053,
              "end": 1070
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@1084:1101",
            "bound_var": null,
            "source_text": "ctx.set_fib(1, 1)",
            "referenced_pat_vars": [],
            "referenced_action_vars": [],
            "range": {
              "start": 1084,
              "end": 1101
            }
          }
        ],
        "seed_facts": [],
        "display_templates": [],
        "typst_templates": [
          {
            "variant_name": "fib",
            "template": "fib({x})",
            "fields": [
              "x"
            ]
          }
        ],
        "precedence_templates": [],
        "diagnostics": []
      }
    },
    {
      "id": "fib_step",
      "label": "Fibonacci Step Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 1180,
            "end": 1948
          },
          "pattern_range": {
            "start": 1246,
            "end": 1744
          },
          "action_range": {
            "start": 1754,
            "end": 1941
          }
        },
        "nodes": [
          {
            "id": "f0",
            "kind": "query",
            "dsl_type": "fib",
            "label": "f0: fib",
            "range": {
              "start": 1550,
              "end": 1574
            },
            "inputs": [
              "x"
            ]
          },
          {
            "id": "f1",
            "kind": "query",
            "dsl_type": "fib",
            "label": "f1: fib",
            "range": {
              "start": 1587,
              "end": 1612
            },
            "inputs": [
              "x1"
            ]
          }
        ],
        "edges": [
          {
            "from": "f0",
            "to": "x",
            "kind": "operand",
            "index": 0
          },
          {
            "from": "f1",
            "to": "x1",
            "kind": "operand",
            "index": 0
          }
        ],
        "roots": [
          "x",
          "x1",
          "x2",
          "f0",
          "f1"
        ],
        "constraints": [
          {
            "id": "constraint_0",
            "source_text": "x1_constraint",
            "resolved_text": "x1.handle().eq(&(x.handle() + (&1_i64).as_handle()))",
            "referenced_vars": [
              "x",
              "x1"
            ],
            "range": {
              "start": 1681,
              "end": 1694
            }
          },
          {
            "id": "constraint_1",
            "source_text": "x2_constraint",
            "resolved_text": "x2.handle().eq(&(x.handle() + (&2_i64).as_handle()))",
            "referenced_vars": [
              "x",
              "x2"
            ],
            "range": {
              "start": 1720,
              "end": 1733
            }
          }
        ],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@1906:1930",
            "bound_var": null,
            "source_text": "ctx.set_fib(x2, f0 + f1)",
            "referenced_pat_vars": [
              "f0",
              "f1",
              "x2"
            ],
            "referenced_action_vars": [
              "f0",
              "f1",
              "x2"
            ],
            "range": {
              "start": 1906,
              "end": 1930
            }
          }
        ],
        "seed_facts": [],
        "display_templates": [],
        "typst_templates": [
          {
            "variant_name": "fib",
            "template": "fib({x})",
            "fields": [
              "x"
            ]
          }
        ],
        "precedence_templates": [],
        "diagnostics": []
      }
    }
  ],
  "relation": [
    {
      "id": "seed_path",
      "label": "Relation Seed Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 508,
            "end": 953
          },
          "pattern_range": {
            "start": 571,
            "end": 730
          },
          "action_range": {
            "start": 740,
            "end": 946
          }
        },
        "nodes": [
          {
            "id": "edge",
            "kind": "query",
            "dsl_type": "Edge",
            "label": "edge: Edge",
            "range": {
              "start": 588,
              "end": 613
            },
            "inputs": []
          }
        ],
        "edges": [],
        "roots": [
          "edge"
        ],
        "constraints": [],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@863:888",
            "bound_var": null,
            "source_text": "ctx.insert_path(src, dst)",
            "referenced_pat_vars": [
              "edge"
            ],
            "referenced_action_vars": [
              "dst",
              "src"
            ],
            "range": {
              "start": 863,
              "end": 888
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@902:935",
            "bound_var": null,
            "source_text": "ctx.set_path_mark(src, dst, true)",
            "referenced_pat_vars": [
              "edge"
            ],
            "referenced_action_vars": [
              "dst",
              "src"
            ],
            "range": {
              "start": 902,
              "end": 935
            }
          }
        ],
        "seed_facts": [
          {
            "id": "seed_0",
            "source_text": "Edge::<RelTx>::insert(1, 2)",
            "committed_root": "Edge::<RelTx>",
            "referenced_vars": [],
            "range": {
              "start": 386,
              "end": 413
            }
          },
          {
            "id": "seed_1",
            "source_text": "Edge::<RelTx>::insert(2, 3)",
            "committed_root": "Edge::<RelTx>",
            "referenced_vars": [],
            "range": {
              "start": 419,
              "end": 446
            }
          }
        ],
        "display_templates": [],
        "typst_templates": [],
        "precedence_templates": [],
        "diagnostics": []
      }
    },
    {
      "id": "extend_path",
      "label": "Relation Extend Rule",
      "ir": {
        "scope": {
          "kind": "add_rule_call",
          "text_range": {
            "start": 959,
            "end": 1577
          },
          "pattern_range": {
            "start": 1024,
            "end": 1354
          },
          "action_range": {
            "start": 1364,
            "end": 1570
          }
        },
        "nodes": [
          {
            "id": "path",
            "kind": "query",
            "dsl_type": "Path",
            "label": "path: Path",
            "range": {
              "start": 1041,
              "end": 1066
            },
            "inputs": []
          },
          {
            "id": "edge",
            "kind": "query",
            "dsl_type": "Edge",
            "label": "edge: Edge",
            "range": {
              "start": 1079,
              "end": 1104
            },
            "inputs": []
          }
        ],
        "edges": [],
        "roots": [
          "path",
          "edge",
          "path",
          "edge"
        ],
        "constraints": [
          {
            "id": "constraint_0",
            "source_text": "join",
            "resolved_text": "path.handle_dst().eq(&edge.handle_src())",
            "referenced_vars": [
              "edge",
              "path"
            ],
            "range": {
              "start": 1339,
              "end": 1343
            }
          }
        ],
        "action_effects": [
          {
            "id": "effect_0",
            "effect_id": "effect@1487:1512",
            "bound_var": null,
            "source_text": "ctx.insert_path(src, dst)",
            "referenced_pat_vars": [
              "edge",
              "path"
            ],
            "referenced_action_vars": [
              "dst",
              "src"
            ],
            "range": {
              "start": 1487,
              "end": 1512
            }
          },
          {
            "id": "effect_1",
            "effect_id": "effect@1526:1559",
            "bound_var": null,
            "source_text": "ctx.set_path_mark(src, dst, true)",
            "referenced_pat_vars": [
              "edge",
              "path"
            ],
            "referenced_action_vars": [
              "dst",
              "src"
            ],
            "range": {
              "start": 1526,
              "end": 1559
            }
          }
        ],
        "seed_facts": [
          {
            "id": "seed_0",
            "source_text": "Edge::<RelTx>::insert(1, 2)",
            "committed_root": "Edge::<RelTx>",
            "referenced_vars": [],
            "range": {
              "start": 386,
              "end": 413
            }
          },
          {
            "id": "seed_1",
            "source_text": "Edge::<RelTx>::insert(2, 3)",
            "committed_root": "Edge::<RelTx>",
            "referenced_vars": [],
            "range": {
              "start": 419,
              "end": 446
            }
          }
        ],
        "display_templates": [],
        "typst_templates": [],
        "precedence_templates": [],
        "diagnostics": []
      }
    }
  ]
} as const;

export function pickRuleScopeByByteOffset(sampleId: string, byteOffset: number): WebRuleScope | null {
  const scopes = webRuleScopesBySampleId[sampleId];
  if (!scopes || scopes.length === 0) {
    return null;
  }
  const direct = scopes.find((scope) => byteOffset >= scope.ir.scope.text_range.start && byteOffset <= scope.ir.scope.text_range.end);
  if (direct) {
    return direct;
  }
  let best: WebRuleScope | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (const scope of scopes) {
    const start = scope.ir.scope.text_range.start;
    const end = scope.ir.scope.text_range.end;
    const distance = byteOffset < start ? start - byteOffset : byteOffset > end ? byteOffset - end : 0;
    if (distance < bestDistance) {
      bestDistance = distance;
      best = scope;
    }
  }
  return best;
}
