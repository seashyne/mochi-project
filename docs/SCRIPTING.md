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

`JumpPower` is deliberately absent: the jump impulse belongs to the input-driven
controller, and a property that accepts a number and ignores it is worse than a
missing one.

## Materials

`part.Material` names a part's surface. Use `Enum.Material`, which is the set of names a
script may choose from:

```lua
part.Material = Enum.Material.Grass
print(part.Material)                              --> Grass
print(part.Material == Enum.Material.Grass)       --> true
```

A misspelled member is `nil`, and assigning it raises, so a typo is caught the moment it
runs instead of quietly doing nothing.

`Enum.Material` is a table of names rather than of objects, so a member compares equal to
its own name - `Enum.Material.Grass == "Grass"`. That also means the plain string still
works, which matters for scripts that pick a material from a config:

```lua
part.Material = config.material   -- "Grass" is accepted
```

A string we do not recognise logs one warning and leaves the part alone; it does not
raise, because a ported script should not die on a surface we have not built yet.

### What each name resolves to

A name becomes a shading mode plus one of the bundled PBR texture sets. Names we have no
texture for keep a sensible shading mode and render without a map.

| Names | Surface |
| --- | --- |
| `Grass`, `LeafyGrass` | grass texture |
| `Brick` | red brick |
| `Wood`, `WoodPlanks`, `Cardboard` | planks |
| `Concrete`, `Plaster`, `Asphalt` | plain concrete |
| `Fabric`, `Carpet` | woven cloth |
| `Marble`, `Snow`, `Salt` | white marble |
| `Granite`, `Slate`, `Cobblestone`, `Pebble`, `Rock`, `Basalt`, `Limestone`, `Pavement`, `Sandstone`, `Sand`, `Mud`, `Ground`, `CeramicTiles`, `ClayRoofTiles`, `RoofShingles` | stone paving |
| `Metal`, `CorrodedMetal`, `Foil` | metal plate |
| `DiamondPlate` | tread plate |
| `CrackedLava` | lava |
| `Neon`, `ForceField` | emissive, no texture |
| `Glass`, `Ice`, `Glacier` | transparent |
| `Plastic`, `SmoothPlastic`, `Rubber`, `Air` | flat colour |

### Choosing a surface without a script

The Studio inspector is the normal way: it shows the texture before you commit to it.
Setting a material from Lua is for scripts, and for worlds ported from elsewhere.

`part.materialTexture` takes a bundled preset id directly (`"marble_white"`,
`"lava_flow"`, ...) when you want a specific set rather than a name.

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
