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
| `cf * vector` | Transforms a point: the vector is rotated, then the position is added |
| `cf + vector`, `cf - vector` | Translation in world space, rotation untouched |
| `CFrame.lookAt(at, target, up?)` | A frame at `at` facing `target`; `up` defaults to world up |
| `cf.Position`, `.LookVector`, `.RightVector`, `.UpVector` | Vectors in world space |
| `cf:Inverse()`, `cf:Lerp(other, alpha)`, `cf:ToEulerAnglesXYZ()` | The usual helpers |

Assigning anything that is not a CFrame to `part.CFrame` is ignored rather than
raising, so a bad value leaves the part where it was.

Not implemented, deliberately: the constructor forms that take another CFrame.
`CFrame.Angles` and `Rotation` are in radians; `rotateY` takes degrees - the one unit
trap left in this area.

## Touching a part

`part.Touched` fires when the player enters a trigger, `part.TouchEnded` when they
leave. Both hand the player to the handler, and both ignore the per-frame `stay`
event so a handler cannot fire sixty times a second.

```lua
local door = script.parent
door.Touched:Connect(function(hit)
  door.setVisible(false)
end)
door.TouchEnded:Connect(function(hit)
  door.setVisible(true)
end)
```

## Property changes

`part.Changed` fires with the property name when a script writes a property, and
`GetPropertyChangedSignal` narrows it to one name.

```lua
part:GetPropertyChangedSignal("Position"):Connect(function()
  print("moved to", part.Position.x)
end)
```

Only writes that go through the script proxy raise it. A part moved by physics does
not, so poll `part.Position` in `script.onUpdate` when you need that.

## Building an interface

`Instance.new` builds GUI nodes the same way it builds parts, and `Parent` decides
where they hang. `player.PlayerGui` is the root.

```lua
local screen = Instance.new("ScreenGui", player.PlayerGui)

local panel = Instance.new("Frame", screen)
panel.Size = UDim2.new(0, 240, 0, 72)
panel.Position = UDim2.new(0, 16, 0, 16)
panel.BackgroundColor3 = Color3.fromRGB(20, 22, 30)
panel.BackgroundTransparency = 0.15

local label = Instance.new("TextLabel", panel)
label.Size = UDim2.fromScale(1, 1)
label.Text = "Score 0"
label.TextColor3 = Color3.fromRGB(255, 255, 255)
label.TextSize = 18

local button = Instance.new("TextButton", panel)
button.Size = UDim2.new(0, 80, 0, 28)
button.Position = UDim2.new(1, -88, 0, 18)
button.Text = "Reset"
button.MouseButton1Click:Connect(function()
  label.Text = "Score 0"
end)
```

| Class | What it is |
| --- | --- |
| `ScreenGui` | Fills the viewport; children position against it |
| `Frame` | A box |
| `TextLabel` | A box with text |
| `TextButton` | A box with text that takes clicks |
| `ImageLabel` / `ImageButton` | A box showing `Image`, tinted by `ImageColor3` |
| `ScrollingFrame` | A clipped box with a `CanvasSize`; `CanvasPosition` is the scroll offset |

A node is not drawn until it is parented, and `node.Parent = nil` takes it off screen
again - building a tree and placing it later works the way it does in the source API.

`Font`, `TextXAlignment` and `TextYAlignment` take an `Enum` member or the bare name in
any casing, and read back as the name - so `label.Font == Enum.Font.Code` is true after
either form. A font the app has no face for maps to the nearest shipped family rather
than failing.

`UDim2.new(scaleX, offsetX, scaleY, offsetY)`; `fromScale` and `fromOffset` are the
shorthand forms. Scale is a fraction of the parent, offset is pixels, and the two add -
`UDim2.new(1, -88, 0, 18)` is "parent width minus 88 pixels".

### Layout and decoration

Three classes attach to a box and change how it draws. They are children, not
properties, exactly as in the source API.

| Class | What it does |
| --- | --- |
| `UICorner` | `CornerRadius = UDim.new(0, 12)` rounds the box |
| `UIPadding` | `PaddingTop` / `PaddingRight` / `PaddingBottom` / `PaddingLeft` inset the children |
| `UIListLayout` | `Padding`, `FillDirection`, `HorizontalAlignment`, `VerticalAlignment` - children flow in order and their `Position` is ignored |
| `UITextSizeConstraint` | `MinTextSize` / `MaxTextSize` clamp both the fixed size and the fitted one |

```lua
local list = Instance.new("UIListLayout", panel)
list.Padding = UDim.new(0, 8)
list.FillDirection = Enum.FillDirection.Vertical

local corner = Instance.new("UICorner", panel)
corner.CornerRadius = UDim.new(0, 10)
```

`TextScaled` shrinks the font until the string fits the box, and `TextWrapped` lets it
wrap; `ClipsDescendants` decides whether a child may spill out (clipping is on by
default here, which the source API leaves off).

`RichText` turns on inline markup: `<b>`, `<i>`, `<u>`, `<s>`, `<font color="#f00">` and
`<br>`. An unknown tag renders as text rather than disappearing. For a score or
timer readout, `ui.setHud` is still less code than a tree.

For state, `React.mount` gives you components over the same tree - see `docs/REACT.md`.

## The character

`player.Character.Humanoid` carries the names an avatar script expects. It is a
table, not an instance tree: there is no `FindFirstChild`, no `Died` signal and no
`HumanoidDescription`.

| Call | Behaviour |
| --- | --- |
| `humanoid.WalkSpeed` | Metres per second. Drives `:MoveTo`; defaults to 4 |
| `humanoid:MoveTo(target)` | Walks to a Vector3 or `(x, y, z)` through the navmesh. Returns false when no route exists |
| `humanoid.Health`, `.MaxHealth`, `:TakeDamage(n)` | The same health the player has |
| `player.Character.Position` | Reads and writes the character position |
| `humanoid.Died:Connect(fn)` | Fires once when health reaches zero |
| `player.CharacterAdded:Connect(fn)` | Fires when the character comes back after death |

Signals return a connection with `:Disconnect()`. They are latched from the health
transition once per frame, so damage from a hazard, another script or the console all
reach the handler.

`JumpPower` sets the launch velocity, and `humanoid.Jump = true` queues one jump. The
number is in the unit a script expects: 50 - the default - maps onto the 9 m/s the
controller ships with, so an untouched value jumps exactly as it did before. `Jump`
reads as false: a jump is a request, not a state this runtime can report back.

## Materials

`part.Material` names a part's surface; `Enum.Material` lists the names and a misspelled
member raises. The full list, what each name resolves to, and how to pick a surface
without a script are in [`MATERIALS.md`](./MATERIALS.md).

## Types and children

`part:IsA("Part")` answers true for anything that is one, including the classes it
inherits from - `BasePart`, `PVInstance`, `Instance`. An agent answers `Model`. The guard
`if child:IsA("BasePart") then` therefore works the way a ported script expects.

`FindFirstChild(name, recursive)` returns a child by name; the second argument searches
descendants, which is how a script reaches into a model without walking it. `WaitForChild`
is the same lookup, because the world exists before a script starts. `FindFirstChildOfClass`
returns the first child of a class.

## Raycasting

`world:Raycast(origin, direction, ignore?)` casts a ray and returns what it hit, or nil.
The direction's length is the reach, so a ten-stud ray pointing down is
`Vector3.new(0, -10, 0)`.

```lua
local hit = world:Raycast(part.Position, Vector3.new(0, -10, 0))
if hit then
  print(hit.Instance.Name, hit.Distance, hit.Position, hit.Normal)
end
```

The optional third argument is a part to pass through - the usual use is ignoring the
caster so a ray does not hit the thing that fired it. A ray stops at the first solid
body; triggers are not hit unless the ray starts inside one.

## Services

`RunService.Heartbeat` fires once per frame with the frame delta, and is the same event
as `script.onUpdate`:

```lua
RunService.Heartbeat:Connect(function(dt)
  -- called every frame
end)
```

`RenderStepped` is the same event here; `IsClient` is true and `IsServer` false, so a
script that branches on them runs instead of raising.

### TweenService

`TweenService:Create(part, info, goal):Play()` moves properties over time.

```lua
local info = TweenInfo.new(1, Enum.EasingStyle.Quad, Enum.EasingDirection.Out)
info.Completed = function() print("arrived") end

TweenService:Create(part, info, { Position = Vector3.new(0, 10, 0) }):Play()
```

`goal` takes any property a script can set: `Position`, `Size`, `CFrame`, `Color`,
`Transparency`, and the same on a GUI object - a `UDim2` size grows through the middle
rather than jumping. Numbers blend directly, every other value blends field by field,
and a `CFrame` uses its own `Lerp`, so rotation does not shear.

`tween:Cancel()` stops it where it is, and `tween:Pause()` / `tween:Resume()` hold it
and pick it up again. `tween.PlaybackState` reports `Begin`, `Delayed`, `Playing`,
`Paused`, `Completed` or `Cancelled`, so a script can ask rather than track its own flag.

`TweenService:GetValue(alpha, style, direction)` returns the curve on its own, clamped to
0..1, which is useful for driving a value by hand or checking a curve before using it.

`TweenService:SmoothDamp(current, target, velocity, smoothTime, maxSpeed, dt)` is the
other half: a critically damped spring for something that follows a target every frame
without overshooting. Feed the returned velocity back in next frame. It takes a number, a
Vector3 or a CFrame; for a CFrame the velocity is a table - `Position` is linear velocity
and `Angular` is radians per second - and the whole table is what goes back in.

Starting a tween on a property cancels an older tween on the same property, so two tweens
cannot fight over one value.

Every tween in a script is driven by one shared frame handler rather than one per tween,
so starting a tween inside a loop does not add a handler each time.

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
