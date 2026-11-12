// Phase 4 visual scripting: typed node graph, deterministic validator, and a
// compiler to Lua source for the sandboxed Mochi runtime. The emitted code is a
// single network.OnServerEvent handler with a bounded dispatch loop; it uses no
// nested function definitions, varargs, goto, or table constructors so it stays
// inside the lightweight Lua subset the runtime interprets.

export type NodeKind =
  | 'event'
  | 'branch'
  | 'setData'
  | 'addCoins'
  | 'broadcast'
  | 'log';

export interface GraphNode {
  id: string;
  kind: NodeKind;
  params: Record<string, string | number | boolean>;
  next?: string;
  trueBranch?: string;
  falseBranch?: string;
}

export interface NodeGraph {
  id: string;
  name: string;
  entryId: string;
  nodes: GraphNode[];
}

export interface CompileResult {
  ok: boolean;
  code?: string;
  errors?: string[];
}

export const NODE_KINDS: NodeKind[] = [
  'event', 'branch', 'setData', 'addCoins', 'broadcast', 'log'
];

export const MAX_GRAPH_STEPS = 256;

const POINTERS: Array<'next' | 'trueBranch' | 'falseBranch'> = [
  'next', 'trueBranch', 'falseBranch'
];

export function countNodes(graph: NodeGraph): number {
  return graph.nodes.length;
}

// Wrap a JS string as a Lua double-quoted literal, escaping quotes, backslashes,
// newlines and control characters deterministically.
export function escapeLuaString(s: string): string {
  let out = '"';
  for (let i = 0; i < s.length; i += 1) {
    const ch = s[i];
    const code = s.charCodeAt(i);
    if (ch === '\\') out += '\\\\';
    else if (ch === '"') out += '\\"';
    else if (ch === '\n') out += '\\n';
    else if (ch === '\r') out += '\\r';
    else if (ch === '\t') out += '\\t';
    else if (code < 32 || code === 127) out += '\\' + String(code).padStart(3, '0');
    else out += ch;
  }
  return out + '"';
}

function luaLiteral(
  v: string | number | boolean | undefined,
  fallback: string | number | boolean
): string {
  const val: string | number | boolean = v === undefined ? fallback : v;
  if (typeof val === 'boolean') return val ? 'true' : 'false';
  if (typeof val === 'number') return Number.isFinite(val) ? String(val) : '0';
  return escapeLuaString(val);
}

function numberLiteral(v: string | number | boolean | undefined, fallback: number): string {
  if (typeof v === 'number' && Number.isFinite(v)) return String(v);
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return String(Number(v));
  if (typeof v === 'boolean') return v ? '1' : '0';
  return String(fallback);
}

function successors(n: GraphNode, byId: Map<string, GraphNode>): string[] {
  const out: string[] = [];
  for (const key of POINTERS) {
    const id = n[key];
    if (id !== undefined && byId.has(id) && !out.includes(id)) out.push(id);
  }
  return out;
}

export function validateGraph(graph: NodeGraph): string[] {
  const errors: string[] = [];
  const { nodes, entryId } = graph;
  const byId = new Map<string, GraphNode>();
  const knownKinds = new Set<string>(NODE_KINDS);

  // 1. duplicate ids (first occurrence wins in the lookup map).
  for (const n of nodes) {
    if (byId.has(n.id)) {
      errors.push(`Duplicate node id "${n.id}"`);
    } else {
      byId.set(n.id, n);
    }
  }

  // 2. unknown kinds.
  for (const n of nodes) {
    if (!knownKinds.has(n.kind)) {
      errors.push(`Node "${n.id}" has unknown kind "${n.kind}"`);
    }
  }

  // 3. missing entry.
  const hasEntry = byId.has(entryId);
  if (!hasEntry) {
    errors.push(`Entry node "${entryId}" does not exist`);
  }

  // 4. branch nodes must declare both branches.
  for (const n of nodes) {
    if (n.kind === 'branch') {
      if (!n.trueBranch) errors.push(`Branch node "${n.id}" is missing trueBranch`);
      if (!n.falseBranch) errors.push(`Branch node "${n.id}" is missing falseBranch`);
    }
  }

  // 5. dangling pointers.
  for (const n of nodes) {
    for (const key of POINTERS) {
      const target = n[key];
      if (target !== undefined && !byId.has(target)) {
        errors.push(`Node "${n.id}" has dangling ${key} -> "${target}"`);
      }
    }
  }

  // 6. cycles via DFS over node ids sorted for deterministic error order.
  const sortedIds = [...byId.keys()].sort();
  const color = new Map<string, number>();
  for (const id of sortedIds) color.set(id, 0);
  const reported = new Set<string>();
  const cycleErrors: string[] = [];
  const dfs = (id: string): void => {
    color.set(id, 1);
    for (const next of successors(byId.get(id)!, byId)) {
      const c = color.get(next) ?? 0;
      if (c === 1) {
        if (!reported.has(next)) {
          reported.add(next);
          cycleErrors.push(`Cycle detected involving node "${next}"`);
        }
      } else if (c === 0) {
        dfs(next);
      }
    }
    color.set(id, 2);
  };
  for (const id of sortedIds) {
    if (color.get(id) === 0) dfs(id);
  }
  errors.push(...cycleErrors);

  // 7. nodes unreachable from the entry (only meaningful when entry exists).
  if (hasEntry) {
    const reachable = new Set<string>([entryId]);
    const stack = [entryId];
    while (stack.length) {
      for (const next of successors(byId.get(stack.pop()!)!, byId)) {
        if (!reachable.has(next)) {
          reachable.add(next);
          stack.push(next);
        }
      }
    }
    for (const n of nodes) {
      if (!reachable.has(n.id)) {
        errors.push(`Node "${n.id}" is unreachable from entry "${entryId}"`);
      }
    }
  }

  return errors;
}

type Push = (indent: number, line: string) => void;

function emitNode(n: GraphNode, indent: number, push: Push, q: (s: string) => string): void {
  const get = (key: string): string | number | boolean | undefined => n.params[key];
  const asString = (key: string, def: string): string => {
    const v = get(key);
    return v === undefined ? def : String(v);
  };

  switch (n.kind) {
    case 'event':
      break;
    case 'log':
      push(indent, `print(${q(asString('message', ''))})`);
      break;
    case 'setData':
      push(indent, `player.data.set(${q(asString('key', 'value'))}, ${luaLiteral(get('value'), 0)})`);
      break;
    case 'addCoins':
      push(indent, `player.data.increment("coins", ${numberLiteral(get('amount'), 1)})`);
      break;
    case 'broadcast':
      push(indent, `network.Broadcast(${q(asString('event', 'Event'))}, data)`);
      break;
    case 'branch': {
      const equals = get('equals');
      const key = q(asString('key', 'value'));
      const cond = equals !== undefined
        ? `data and tostring(data[${key}]) == ${q(String(equals))}`
        : `data and data[${key}]`;
      push(indent, `if ${cond} then`);
      push(indent + 1, `node = ${q(n.trueBranch!)}`);
      push(indent, `else`);
      push(indent + 1, `node = ${q(n.falseBranch!)}`);
      push(indent, `end`);
      return; // branch owns its transition
    }
  }
  push(indent, `node = ${n.next !== undefined ? q(n.next) : 'nil'}`);
}

export function compileGraphToLua(graph: NodeGraph): CompileResult {
  const errors = validateGraph(graph);
  if (errors.length > 0) return { ok: false, errors };

  const q = escapeLuaString;
  const lines: string[] = [];
  const push: Push = (indent, line) => lines.push('  '.repeat(indent) + line);

  push(0, `-- Compiled from node graph ${q(graph.name)} (${q(graph.id)})`);
  push(0, `network.OnServerEvent(${q(graph.id)}, function(player, data)`);
  push(1, `local node = ${q(graph.entryId)}`);
  push(1, `local steps = 0`);
  push(1, `while node ~= nil and steps < ${MAX_GRAPH_STEPS} do`);
  push(2, `steps = steps + 1`);
  graph.nodes.forEach((n, i) => {
    push(2, `${i === 0 ? 'if' : 'elseif'} node == ${q(n.id)} then`);
    emitNode(n, 3, push, q);
  });
  push(2, `else`);
  push(3, `node = nil`);
  push(2, `end`);
  push(1, `end`);
  push(0, `end)`);

  return { ok: true, code: lines.join('\n') };
}
