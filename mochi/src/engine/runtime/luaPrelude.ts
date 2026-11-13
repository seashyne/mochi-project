// The Lua half of the script API: the parts that must live in Lua because they
// cooperate with coroutines.
//
// A script runs inside a coroutine so `task.wait` can suspend it and the host can
// resume it on a later frame. That is the whole point: the genre-standard loop
// patterns assume `task.wait` yields.

export const PRELUDE_MARKER = '-- __mochi_prelude_end';

const PRELUDE = `-- Mochi script prelude: coroutine-driven task library.
task = task or {}
function task.wait(seconds, fn)
  local delay = tonumber(seconds) or 0
  if delay < 0 then delay = 0 end
  -- Legacy two-argument form: task.wait(delay, callback) schedules the callback.
  if type(fn) == "function" then
    if __taskSchedule then __taskSchedule(delay, fn) end
    return delay
  end
  if coroutine.isyieldable() then
    return coroutine.yield(delay)
  end
  return delay
end
function task.delay(seconds, fn)
  if type(fn) == "function" and __taskSchedule then
    __taskSchedule(tonumber(seconds) or 0, fn)
  end
end
function task.spawn(fn)
  if type(fn) == "function" and __taskSchedule then __taskSchedule(0, fn) end
end
wait = task.wait
if script ~= nil then script.wait = task.wait end
${PRELUDE_MARKER}
__mochi_thread = coroutine.create(function()
`;

const EPILOGUE = `
end)
-- wasmoon hands back only the first value of a multi-return, so the step result
-- travels as one table.
function __mochi_step(...)
  local ok, value = coroutine.resume(__mochi_thread, ...)
  local status = coroutine.status(__mochi_thread)
  if not ok then
    return { ok = false, delay = 0, status = status, message = tostring(value) }
  end
  return { ok = true, delay = tonumber(value) or 0, status = status, message = "" }
end
`;

export interface ComposedScript {
  chunk: string;
  /** Lines the prelude added, so an error line can be mapped back to user code. */
  lineOffset: number;
}

/**
 * Wraps user code in a coroutine. `lineOffset` is how many lines precede it, which
 * is what turns a reported line number back into a line of the creator's script.
 */
export function composeScript(code: string): ComposedScript {
  const chunk = `${PRELUDE}${code}${EPILOGUE}`;
  return { chunk, lineOffset: PRELUDE.split('\n').length - 1 };
}
