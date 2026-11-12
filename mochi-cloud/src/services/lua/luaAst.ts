// AST node definitions for the server scripting Lua subset.

export type LuaExpr =
  | { type: 'nil' }
  | { type: 'boolean'; value: boolean }
  | { type: 'number'; value: number }
  | { type: 'string'; value: string }
  | { type: 'name'; name: string }
  | { type: 'index'; target: LuaExpr; key: LuaExpr }
  | { type: 'call'; callee: LuaExpr; args: LuaExpr[] }
  | { type: 'method'; target: LuaExpr; method: string; args: LuaExpr[] }
  | { type: 'binary'; op: string; left: LuaExpr; right: LuaExpr }
  | { type: 'unary'; op: string; operand: LuaExpr }
  | { type: 'table'; fields: Array<{ key: LuaExpr | null; value: LuaExpr }> }
  | { type: 'function'; params: string[]; body: LuaStmt[] };

export interface LuaIfBranch {
  cond: LuaExpr | null;
  body: LuaStmt[];
}

export type LuaStmt =
  | { type: 'local'; names: string[]; values: LuaExpr[] }
  | { type: 'assign'; targets: LuaExpr[]; values: LuaExpr[] }
  | { type: 'call'; call: LuaExpr }
  | { type: 'if'; branches: LuaIfBranch[] }
  | { type: 'while'; cond: LuaExpr; body: LuaStmt[] }
  | { type: 'repeat'; body: LuaStmt[]; cond: LuaExpr }
  | {
      type: 'forNum';
      name: string;
      start: LuaExpr;
      stop: LuaExpr;
      step: LuaExpr | null;
      body: LuaStmt[];
    }
  | { type: 'forIn'; names: string[]; values: LuaExpr[]; body: LuaStmt[] }
  | { type: 'functionDecl'; target: LuaExpr; params: string[]; body: LuaStmt[] }
  | { type: 'localFunction'; name: string; params: string[]; body: LuaStmt[] }
  | { type: 'return'; values: LuaExpr[] }
  | { type: 'break' }
  | { type: 'do'; body: LuaStmt[] };

export interface LuaChunk {
  body: LuaStmt[];
}
