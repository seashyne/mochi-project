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

## CFrame

`CFrame` is a position plus a row-major 3x3 rotation. It exists because positioning a
part by rotation means composing transforms, and composition needs an operator.

```lua
local door = script.parent
door.CFrame = CFrame.new(0, 3, 0) * CFrame.Angles(0, math.pi / 2, 0)
print(door.CFrame.Position.x)
```

| Call | Behaviour |
| --- | --- |
| `CFrame.new(x, y, z)` | A position with no rotation |
| `CFrame.Angles(rx, ry, rz)` | A rotation in radians, Euler XYZ - the order the engine uses |
| `a * b` | `b` expressed in `a`'s space: rotations multiply, `b`'s position is rotated and added |
| `cf.Position`, `.LookVector`, `.RightVector`, `.UpVector` | Vectors in world space |
| `cf:Inverse()`, `cf:Lerp(other, alpha)`, `cf:ToEulerAnglesXYZ()` | The usual helpers |

Assigning anything that is not a CFrame to `part.CFrame` is ignored rather than
raising, so a bad value leaves the part where it was.

Not implemented, deliberately: `cf * Vector3`, `CFrame.lookAt`, and the constructor
forms that take another CFrame. `Rotation` is in radians; `rotateY` takes degrees.

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

## Coming from another platform

`docs/API_PARITY.md` maps common calls to their equivalents here, and lists what
is deliberately absent. Start there when porting a script.
