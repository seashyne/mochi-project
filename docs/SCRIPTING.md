# Scripting: `task` and Script Lifetime

A script runs inside a Lua coroutine, so `task.wait` genuinely suspends it and the
runtime resumes it on a later frame. Before this change `task.wait` only scheduled
a callback, which meant the standard `while true do ... task.wait(1) ... end` loop
either spun or did nothing.

## The task library

| Call | Behaviour |
| --- | --- |
| `task.wait(seconds)` | Suspends the script for `seconds` of session time, then continues. Returns the delay. |
| `task.wait(seconds, callback)` | Legacy two-argument form kept for existing scripts: schedules `callback` and returns immediately. `task.delay` is the documented spelling. |
| `task.delay(seconds, callback)` | Runs `callback` later without suspending anything. |
| `task.spawn(callback)` | Runs `callback` on the next host tick. |
| `wait(seconds)` / `script.wait(seconds)` | Aliases of `task.wait`. |

`task.wait` inside an event handler is **not** a yield. Handlers run from the host
on the main Lua thread, where yielding is impossible, so the call returns the delay
immediately. Use `task.delay` from a handler when you want to defer work.

## Time

`task.wait` measures session time, the same clock `world.getTime()` reports. It
does not advance while the game is paused, and a script resumed late continues from
where it stopped rather than skipping ahead.

## Errors

An error inside a script stops that script, not the session. It is reported to the
console with the line number mapped back to the creator's source: the coroutine
wrapper the runtime adds is subtracted from the reported line, so line 2 in the
editor is line 2 in the error.

Errors inside a handler (an `onUpdate` or `onTouch` callback) are reported the same
way and do not stop the script that registered the handler.

## Disposal

Disposing a script closes its Lua state and clears any timers it scheduled, so a
callback that fires after teardown is dropped instead of raising "attempt to call a
function after closing the Lua state".
