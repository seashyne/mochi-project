# Scripting API Parity

For a creator arriving from Roblox: what works here, what works with a different
shape, and what does not exist. The point of the document is to make the gaps
finite and visible instead of something a creator discovers one script at a time.

Everything below was read out of the runtime, not from memory. Source of truth:

- `mochi/src/engine/runtime/luaGlobals.ts` - globals (`world`, `ui`, `Instance`,
  `network`, `animation`, `agent`, `player`, `players`, `script`)
- `mochi/src/engine/runtime/luaNodeApi.ts` - object and world proxies
- `mochi/src/engine/runtime/luaPlayerApi.ts` - the player proxy
- `mochi/src/engine/runtime/luaPrelude.ts` - `task` and the coroutine wrapper
- `mochi/src/engine/runtime/audioRouting.ts` - how `playSound` picks a path

Legend: **Yes** same idea, **Shape** same idea but a different call shape,
**No** absent, **Mochi** a platform-specific addition.

## Instances and hierarchy

| Common call | Here | Notes |
| --- | --- | --- |
| `Instance.new("Part")` | Yes | `Instance.new("Part", props)` accepts `Name`, `Position`, `Size`, `Color`, `Anchored` |
| `world.createPart({...})` | Mochi | Same result, property names in lower or Pascal case |
| `part.Parent = x` | Yes | Assigning a node reparents it |
| `part:Destroy()` / `part.destroy()` | Yes | `Destroy` and `destroy` are both bound |
| `:GetChildren()` | Yes | Returns Lua node proxies |
| `:FindFirstChild(name)` | Yes | Also `findFirstChild` |
| `:IsA("Part")` | Shape | Compares against Mochi object types (`block`, `coin`, `agent`...), not Roblox class names |
| `game.Workspace`, `game:GetService(...)` | No | Use `world.getParts()` / `world.findPart(name)` |
| `:WaitForChild(name)` | Yes | An alias of `:FindFirstChild`. The world exists before a script starts, so waiting is a lookup - it returns nil for a name that is not there instead of blocking |
| `Instance.new("Folder")` / `"Model"` / `"Configuration"` | Yes | An invisible grouping node: no mesh, no collider, children attach to it |
| `Instance.new("Constraint")` / `"ParticleEmitter"` | Yes | Maps onto the `constraint` and `particle` object types |
| `Instance.new("Script")` | No | A script is authored in the editor, not created at runtime |

## Object properties

| Property | Here | Notes |
| --- | --- | --- |
| `Position`, `Size`, `Color`, `Anchored`, `Visible`, `Name`, `ClassName` | Yes | Lower-case aliases also work (`position`, `size`, `color`) |
| `Rotation` | Shape | **Radians** in a `{x,y,z}` table. `rotateY(degrees)` is the degree-based helper |
| `part.Transparency` | No | `part.visible` is a boolean; use material presets for translucency |
| `CFrame` | Shape | `CFrame.new`, `CFrame.Angles`, `CFrame.lookAt`, `cf * cf`, `cf * Vector3`, `cf + Vector3`, `cf - Vector3`, `Position`, `LookVector`, `RightVector`, `UpVector`, `:Inverse()`, `:Lerp()`, `:ToEulerAnglesXYZ()` |
| `Material` | Shape | Five names: `plastic`, `neon`, `metal`, `glass`, `wood`. Not Roblox's full enum (no grass, sand or fabric), and a part takes one material, not per-face surfaces |
| `SurfaceAppearance`, `Texture` | Shape | `materialTexture` picks from 13 bundled CC0 PBR sets; `textureUrl` takes an uploaded image. No per-face mapping |
| `Orientation`, `CanCollide` | No | `anchored` covers the common physics intent |
| `part.position = Vector3.new(...)` | Yes | Also `part.setPosition(x,y,z)` and `part.setPosition(Vector3.new(...))` |
| `setColor`, `setScale`, `setRotation`, `setVisible`, `rotateY` | Mochi | Setter methods alongside the properties |
| `setVelocity`, `applyImpulse` | Mochi | Per-object physics impulse |

## Events and time

| Common call | Here | Notes |
| --- | --- | --- |
| `part.Touched:Connect(fn)` | Yes | Also `part.onTouch(fn)` |
| `part.TouchEnded:Connect(fn)` | Yes | Fires when the player leaves the trigger; one event per contact edge |
| `part.Changed:Connect(fn)`, `part:GetPropertyChangedSignal("Position")` | Shape | Fires for writes that go through the script proxy (`Position`, `Rotation`, `Size`, `Color`, `Visible`, `Name`, `Anchored`). Movement driven by physics does not raise it |
| `script.onUpdate.Connect(fn)` | Mochi | The per-frame hook. `RunService.Heartbeat` / `RenderStepped` alias it |
| `task.wait(seconds)` | Yes | **Yields** the script coroutine (5.1); see `docs/SCRIPTING.md` |
| `wait(n)` / `script.wait(n)` | Yes | Aliases of `task.wait` |
| `task.delay(n, fn)` / `task.spawn(fn)` | Yes | Host timers, not yields |
| `task.wait(n, fn)` | Shape | Two-argument form is a Mochi extension that schedules a callback instead of yielding |
| `print`, `warn` | Yes | Logged to the session console |
| `os.time()`, `tick()` | Yes | `os.time()` is epoch seconds; `tick()` is session time - the same clock `world.getTime()` reports, which a paused game does not advance |

## Player

| Common call | Here | Notes |
| --- | --- | --- |
| `game.Players.LocalPlayer` | Shape | `player` is the global; `players.LocalPlayer`, `players.getLocalPlayer()` also work |
| `player.Name`, `player.Health`, `player.MaxHealth`, `player.Position` | Yes | Lower-case aliases too |
| `player.Character`, `Humanoid`, `WalkSpeed` | Shape | `player.Character.Humanoid` is a table with the right names, not an instance: `WalkSpeed`, `JumpPower`, `Jump`, `Health`, `MaxHealth`, `:MoveTo(v)`, `:TakeDamage(n)`, `Character.Position`, and `Humanoid.Died` / `player.CharacterAdded` signals. `Jump` is write-only - a jump is a request, not a state this runtime reports. No `HumanoidDescription`, no instance parenting |
| `player:MoveTo(...)` | Shape | `player.moveTo(x, z, speed)` - x/z only, no point argument |
| `player:LoadCharacter()`, `CharacterAdded` | No | `player.respawn()` is the equivalent action |
| `player:DistanceFromCharacter(p)` | No | Compute it from `position` |
| `addScore`, `getScore`, `damage`, `heal`, `applyImpulse`, `setVelocity`, `stopMoving`, `isMoving` | Mochi | Gameplay shortcuts on the player proxy |

## World, audio and agents

| Common call | Here | Notes |
| --- | --- | --- |
| `workspace:GetChildren()` | Shape | `world.getParts()`, `world.getPartCount()` |
| `workspace.Gravity` | Shape | `world.setGravity(x)` / `world.getGravity()` |
| `workspace:FindFirstChild(name)` | Shape | `world.findPart(name)` (also `findFirstChild`) |
| `spawn point` | Mochi | `world.setSpawnPoint(point)` / `getSpawnPoint()` |
| `Sound:Play()` / `SoundService` | Shape | `world.playSound(name, position)` where name is a recipe, an access id or a URL |
| `world.loadSound(id)` | Mochi | Warms the sample cache; the first `playSound` of a new file is silent |
| `world.playSound` spatial behaviour | Yes | Attenuation, panning and Doppler as built-in behaviour, not properties |
| `PathfindingService`, `Humanoid:MoveTo` | Shape | `agent.moveTo(id, x, z, speed)`, `agent.stop(id)`, `agent.isMoving(id)`, `agent.position(id)` |
| `TweenService:Create(obj, info, goal)`, `TweenInfo.new(...)` | Yes | Numbers, colours, vectors, UDim2 and CFrame interpolate; `DelayTime`, `Reverses` and `RepeatCount` are honoured. `tween.Completed:Connect(fn)` and the older `info.Completed = fn` both fire. Driven from the owning script's update event, so a tween stops when its script is disposed |
| `animation.setParameter` / `trigger` | Mochi | Drives the animation state graph; separate from `TweenService` |

## UI, data and networking

| Common call | Here | Notes |
| --- | --- | --- |
| `ScreenGui`, `Frame`, `TextLabel`, `TextButton`, `ImageLabel`, `ImageButton`, `ScrollingFrame` | Shape | A real tree under `player.PlayerGui`: `Instance.new(class, parent, props)`, `Parent`, `Position`/`Size` as `UDim2`, `AnchorPoint`, `BackgroundColor3`, `BackgroundTransparency`, `BorderSizePixel`, `ClipsDescendants`, `Text`, `TextColor3`, `TextSize`, `TextScaled`, `TextWrapped`, `RichText`, `Font`, `TextXAlignment`/`TextYAlignment`, `Image`, `ImageColor3`, `ScaleType`, `Visible`, `ZIndex`, `LayoutOrder`, `:Destroy()`, `:FindFirstChild()`, `:GetChildren()`, and `MouseButton1Click` / `Activated` |
| `UICorner`, `UIPadding`, `UIScale`, `UIListLayout`, `UIGridLayout`, `UIAspectRatioConstraint`, `UITextSizeConstraint` | Shape | Attached as children, the same way the source API does it: `CornerRadius`; `PaddingTop`/`Bottom`/`Left`/`Right`; `Scale`; `Padding`, `FillDirection`, `HorizontalAlignment`/`VerticalAlignment`, `SortOrder`; `CellSize`, `CellPadding`; `AspectRatio`, `DominantAxis`; `MinTextSize`, `MaxTextSize`. A layout takes over child positioning, so their `Position` is ignored |
| `ui.setHud(id, element)` | Mochi | The card list, kept for score and timer readouts. Typography is `font = "mono" \| "ui" \| "display"` and `size = "sm" \| "md" \| "lg"`; unknown values are ignored, not thrown |
| `player:FindFirstChild("leaderstats")` | Shape | `ui.setLeaderboard(category, score)` |
| `React.createElement`, `React.mount`, `React.useState` | Shape | A small reconciler over the GUI tree, not a port of React: no keys, no context, no memo. `useState` and `useEffect` are the whole hook set. See `docs/REACT.md` |
| `StarterPlayer.StarterPlayerScripts` | No | Scripts attach to objects in the manifest |
| `game:GetService("ReplicatedStorage")` | No | Use `network.FireServer` / `network.OnClientEvent` |
| `RemoteEvent:FireServer(data)` | Shape | `network.FireServer(eventName, data)` - the event name is an argument |
| `RemoteEvent.OnClientEvent:Connect(fn)` | Shape | `network.OnClientEvent(eventName, fn)` |
| `network.GetState(key)` | Mochi | Reads replicated state pushed by a server script |
| `DataStoreService`, `MemoryStoreService` | No | Server scripts have a per-player `player.data` API instead |
| `MarketplaceService`, `TeleportService` | No | No economy, no cross-place teleport |

## Types and standard library

| Common call | Here | Notes |
| --- | --- | --- |
| `Vector3.new(x,y,z)`, `Vector3.zero`, `Vector3.one` | Yes | Plain `{x,y,z}` tables |
| `Color3.fromRGB(r,g,b)`, `Color3.new(r,g,b)` | Yes | Plain `{r,g,b}` tables |
| `toVector(value)` | Mochi | Coerces loose Lua values into a vector |
| `CFrame` | Shape | Position plus a row-major 3x3; see the property table above |
| `UDim2.new`, `UDim2.fromScale`, `UDim2.fromOffset` | Yes | Plain `{xScale, xOffset, yScale, yOffset}` tables |
| `Vector2.new` | Yes | Plain `{x,y}` tables; used for `AnchorPoint` |
| `Enum.Font`, `Enum.TextXAlignment`, `Enum.TextYAlignment` | Yes | Members are strings, so `label.Font == Enum.Font.Code` holds. A bare `"code"` or `"Roboto Mono"` assigns too; a name the app has no face for maps to the nearest shipped family instead of failing |
| `Ray`, `BrickColor`, `NumberRange`, the rest of `Enum` | No | Not part of the runtime |
| `math.*`, `string.*`, `table.*`, `pairs`, `ipairs`, `pcall` | Yes | Real Lua 5.4 from wasmoon |
| `coroutine.*` | Yes | Available; the script itself runs inside one |

## The first five minutes: a coin

Roblox-shaped script:

```lua
local coin = script.Parent
coin.Touched:Connect(function(hit)
  local player = game.Players:GetPlayerFromCharacter(hit.Parent)
  if player then coin:Destroy() end
end)
```

The same idea here:

```lua
local coin = script.parent
coin.onTouch(function(other)
  coin.Destroy()
  player.addScore("Coins", 1)
  world.playSound("coin_pickup", coin.position)
end)
```

The differences are all structural, not linguistic: there is no character tree to
walk, no `GetPlayerFromCharacter`, and scoring plus audio are direct calls.

## Gaps by impact

Ordered by how quickly a porting creator hits them. Each line is a work item, not
a promise.

1. **`Humanoid` / `Character` tree** - closed for behaviour: `WalkSpeed`, `JumpPower`,
   `Jump`, health, `:MoveTo`, `:TakeDamage`, `Died`, `CharacterAdded`, and
   `FindFirstChild` / `WaitForChild` on the character. Still missing are the two things
   that need an asset pipeline rather than a property: `HumanoidDescription` and
   animation tracks (`:LoadAnimation`). The runtime animates from a state graph, not
   from keyframe assets, so there is no track to hand back.
2. **GUI tree** - closed. Six drawable classes build a real tree under
   `player.PlayerGui` with `UDim2` positioning, text, images and click events; six
   decoration and layout classes shape it, `ScrollingFrame` scrolls it, and
   `TweenService` animates it. Nothing from the class list is missing; the gaps left
   are behaviours, not classes.
3. **`CFrame`** - closed for the common surface: `new`, `Angles`, `lookAt`, `*` with
   both a CFrame and a Vector3, `+`/`-` with a Vector3, `Position`, `LookVector` and
   the methods all exist. The one remaining trap is a unit convention: `CFrame.Angles`
   is radians while the `rotateY` property is degrees.
4. **Services** - `DataStoreService`, `TeleportService` and `MarketplaceService` have
   no direct equivalent. `RunService` and `TweenService` do.
5. **Instance classes** - `Folder`, `Model`, `Configuration`, `Constraint` and
   `ParticleEmitter` are created at runtime and behave as groups. `Attachment` and
   per-face surfaces have no equivalent: attachment points exist for asset mounting in
   the scene loader, not as a scripting concept.
6. **`WaitForChild` / `CharacterAdded` semantics** - `WaitForChild` is an alias of
   `FindFirstChild` on every proxy, because the world is ready before a script starts.
   `CharacterAdded` fires on respawn, not on load.

## Maintenance

This table is a contract with creators, not marketing. When a Lua global changes,
update the matching row in the same commit. If a row says **Yes** and the code says
otherwise, that is a bug in the table and should be fixed before the next publish.
