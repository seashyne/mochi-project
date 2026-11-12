// Builds the sandboxed global environment exposed to server scripts. Every host
// capability is an explicit native function, so scripts cannot reach Node APIs.

import { parseLua } from './luaParser';
import {
  LuaInterpreter,
  type LuaHostApi,
  type LuaInterpreterOptions
} from './luaInterpreter';
import {
  LuaTable,
  MultiValue,
  LuaRuntimeError,
  display,
  expandValues,
  firstValue,
  toJS,
  type LuaResult,
  type LuaValue
} from './luaValues';
import { LuaRandom, formatLuaString } from './luaStdlib';

function native(name: string, fn: (args: LuaValue[]) => LuaResult) {
  return { kind: 'native' as const, name, fn };
}

function asString(value: LuaValue, label: string): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  throw new LuaRuntimeError(`${label} must be a string`);
}

export interface LuaSandbox {
  interpreter: LuaInterpreter;
  run(code: string): { ok: boolean; error?: string };
}

export function createLuaSandbox(host: LuaHostApi, options: LuaInterpreterOptions = {}): LuaSandbox {
  const interpreter = new LuaInterpreter(options);
  let lastError: string | null = null;

  interpreter.setGlobal(
    'print',
    native('print', (args) => {
      host.print(args.map((value) => display(value)).join('\t'));
      return null;
    })
  );
  interpreter.setGlobal('tostring', native('tostring', (args) => display(args[0] ?? null)));
  interpreter.setGlobal(
    'error',
    native('error', (args) => {
      throw new LuaRuntimeError(display(args[0] ?? null));
    })
  );
  interpreter.setGlobal(
    'assert',
    native('assert', (args) => {
      const value = args[0] ?? null;
      if (value === null || value === false) {
        throw new LuaRuntimeError(args.length > 1 ? display(args[1]) : 'assertion failed!');
      }
      return value;
    })
  );
  // Lua's pcall returns (ok, ...) - the interpreter now supports multi-return,
  // so the error message arrives as the second value. lastError() stays for
  // scripts written against the earlier single-value form.
  interpreter.setGlobal(
    'pcall',
    native('pcall', (args) => {
      const target = args[0];
      if (!target || typeof target !== 'object' || !('kind' in target)) {
        throw new LuaRuntimeError('pcall expects a function');
      }
      try {
        const result = interpreter.invoke(target, args.slice(1), 'pcall target');
        lastError = null;
        return new MultiValue([true, ...expandValues(result)]);
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
        return new MultiValue([false, lastError]);
      }
    })
  );
  interpreter.setGlobal('lastError', native('lastError', () => lastError));
  interpreter.setGlobal(
    'tonumber',
    native('tonumber', (args) => {
      const value = args[0];
      if (typeof value === 'number') return value;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    })
  );
  interpreter.setGlobal(
    'type',
    native('type', (args) => {
      const value = args[0];
      if (value === null || value === undefined) return 'nil';
      if (typeof value === 'string') return 'string';
      if (typeof value === 'number') return 'number';
      if (typeof value === 'boolean') return 'boolean';
      if (value instanceof LuaTable) return 'table';
      return 'function';
    })
  );

  const mathTable = new LuaTable();
  const random = new LuaRandom();
  mathTable.set('floor', native('math.floor', (a) => Math.floor(Number(a[0] ?? 0))));
  mathTable.set('ceil', native('math.ceil', (a) => Math.ceil(Number(a[0] ?? 0))));
  mathTable.set('abs', native('math.abs', (a) => Math.abs(Number(a[0] ?? 0))));
  mathTable.set('sqrt', native('math.sqrt', (a) => Math.sqrt(Number(a[0] ?? 0))));
  mathTable.set('sin', native('math.sin', (a) => Math.sin(Number(a[0] ?? 0))));
  mathTable.set('cos', native('math.cos', (a) => Math.cos(Number(a[0] ?? 0))));
  mathTable.set('tan', native('math.tan', (a) => Math.tan(Number(a[0] ?? 0))));
  mathTable.set('asin', native('math.asin', (a) => Math.asin(Number(a[0] ?? 0))));
  mathTable.set('acos', native('math.acos', (a) => Math.acos(Number(a[0] ?? 0))));
  mathTable.set('atan', native('math.atan', (a) => Math.atan(Number(a[0] ?? 0))));
  mathTable.set('atan2', native('math.atan2', (a) => Math.atan2(Number(a[0] ?? 0), Number(a[1] ?? 0))));
  mathTable.set('fmod', native('math.fmod', (a) => Number(a[0] ?? 0) % Number(a[1] ?? 1)));
  mathTable.set('pow', native('math.pow', (a) => Math.pow(Number(a[0] ?? 0), Number(a[1] ?? 0))));
  mathTable.set('rad', native('math.rad', (a) => (Number(a[0] ?? 0) * Math.PI) / 180));
  mathTable.set('deg', native('math.deg', (a) => (Number(a[0] ?? 0) * 180) / Math.PI));
  mathTable.set('min', native('math.min', (a) => Math.min(...a.map((v) => Number(v ?? 0)))));
  mathTable.set('max', native('math.max', (a) => Math.max(...a.map((v) => Number(v ?? 0)))));
  mathTable.set('random', native('math.random', (a) => {
    if (a.length === 0) return random.next();
    const upper = Number(a[a.length - 1] ?? 1);
    if (a.length === 1) return Math.floor(random.next() * upper) + 1;
    const lower = Number(a[0] ?? 1);
    return Math.floor(random.next() * (upper - lower + 1)) + lower;
  }));
  mathTable.set('randomseed', native('math.randomseed', (a) => {
    random.reseed(Number(a[0] ?? Date.now()));
    return null;
  }));
  mathTable.set('huge', Number.POSITIVE_INFINITY);
  mathTable.set('pi', Math.PI);
  interpreter.setGlobal('math', mathTable);

  const stringTable = new LuaTable();
  stringTable.set('len', native('string.len', (a) => display(a[0] ?? '').length));
  stringTable.set('upper', native('string.upper', (a) => display(a[0] ?? '').toUpperCase()));
  stringTable.set('lower', native('string.lower', (a) => display(a[0] ?? '').toLowerCase()));
  stringTable.set('sub', native('string.sub', (a) => {
    const text = display(a[0] ?? '');
    const from = Number(a[1] ?? 1) - 1;
    const to = a[2] === undefined ? text.length : Number(a[2]);
    return text.slice(from, to);
  }));
  stringTable.set('rep', native('string.rep', (a) => display(a[0] ?? '').repeat(Math.max(0, Number(a[1] ?? 0)))));
  stringTable.set('format', native('string.format', (a) => {
    const format = display(a[0] ?? '');
    return formatLuaString(format, a.slice(1), (value) => display(value as LuaValue));
  }));
  interpreter.setGlobal('string', stringTable);

  const tableLib = new LuaTable();
  tableLib.set('insert', native('table.insert', (a) => {
    const target = a[0];
    if (!(target instanceof LuaTable)) throw new LuaRuntimeError('table.insert expects a table');
    target.set(target.length() + 1, a[1] ?? null);
    return null;
  }));
  tableLib.set('concat', native('table.concat', (a) => {
    const target = a[0];
    if (!(target instanceof LuaTable)) throw new LuaRuntimeError('table.concat expects a table');
    const separator = typeof a[1] === 'string' ? a[1] : '';
    return Array.from({ length: target.length() }, (_, i) => display(target.get(i + 1))).join(separator);
  }));
  tableLib.set('remove', native('table.remove', (a) => {
    const target = a[0];
    if (!(target instanceof LuaTable)) throw new LuaRuntimeError('table.remove expects a table');
    const length = target.length();
    const position = a[1] === undefined ? length : Math.trunc(Number(a[1]));
    if (position < 1 || position > length) return null;
    const removed = target.get(position);
    for (let i = position; i < length; i++) target.set(i, target.get(i + 1));
    target.set(length, null);
    return removed;
  }));
  tableLib.set('sort', native('table.sort', (a) => {
    const target = a[0];
    if (!(target instanceof LuaTable)) throw new LuaRuntimeError('table.sort expects a table');
    const comparator = a[1];
    const items = Array.from({ length: target.length() }, (_, i) => target.get(i + 1));
    const hasComparator = comparator !== undefined && comparator !== null;
    items.sort((left, right) => {
      if (hasComparator) {
        const result = interpreter.invoke(comparator, [left, right], 'sort comparator');
        return interpreter.truthy(firstValue(result)) ? -1 : 1;
      }
      if (typeof left === 'number' && typeof right === 'number') return left - right;
      return display(left) < display(right) ? -1 : 1;
    });
    items.forEach((item, index) => target.set(index + 1, item));
    return null;
  }));
  interpreter.setGlobal('table', tableLib);

  // `os` is intentionally not exposed (it is a Node host global); scripts get
  // just the two clock readings they actually need.
  interpreter.setGlobal('time', native('time', () => Math.floor(Date.now() / 1000)));
  interpreter.setGlobal('clock', native('clock', () => Date.now() / 1000));

  const network = new LuaTable();
  network.set('OnServerEvent', native('network.OnServerEvent', (args) => {
    const eventName = asString(args[0] ?? null, 'event name');
    const handler = args[1];
    if (!handler || typeof handler !== 'object' || !('kind' in handler) || handler.kind !== 'lua') {
      throw new LuaRuntimeError('network.OnServerEvent expects a function');
    }
    interpreter.addHandler(eventName, handler);
    return null;
  }));
  network.set('FireClient', native('network.FireClient', (args) => {
    host.fireClient(
      asString(args[0] ?? null, 'player id'),
      asString(args[1] ?? null, 'event name'),
      toJS(args[2] ?? null)
    );
    return null;
  }));
  network.set('Broadcast', native('network.Broadcast', (args) => {
    host.broadcast(asString(args[0] ?? null, 'event name'), toJS(args[1] ?? null));
    return null;
  }));
  interpreter.setGlobal('network', network);

  const state = new LuaTable();
  state.set('set', native('state.set', (args) => {
    host.setState(asString(args[0] ?? null, 'state key'), toJS(args[1] ?? null));
    return null;
  }));
  state.set('get', native('state.get', (args) => {
    const key = asString(args[0] ?? null, 'state key');
    return LuaTable.fromJS(host.getState(key));
  }));
  interpreter.setGlobal('state', state);

  // Server-authority room helpers. Lifecycle callbacks live outside the remote
  // event registry, so a client can never invoke them.
  const room = new LuaTable();
  const lifecycle = (name: string, label: string) =>
    native(label, (args) => {
      const handler = args[0];
      if (!handler || typeof handler !== 'object' || !('kind' in handler) || handler.kind !== 'lua') {
        throw new LuaRuntimeError(`${label} expects a function`);
      }
      interpreter.lifecycle.add(name, handler);
      return null;
    });
  room.set('onPlayerAdded', lifecycle('PlayerAdded', 'room.onPlayerAdded'));
  room.set('onPlayerRemoving', lifecycle('PlayerRemoving', 'room.onPlayerRemoving'));
  room.set('playerCount', native('room.playerCount', () => host.playerCount()));
  interpreter.setGlobal('room', room);

  return {
    interpreter,
    run(code: string) {
      try {
        interpreter.run(parseLua(code));
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err instanceof Error ? err.message : String(err) };
      }
    }
  };
}
