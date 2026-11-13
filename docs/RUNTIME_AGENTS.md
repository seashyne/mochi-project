# Agent NPCs (`agent.*`)

Runtime reference for the `agent` object type. `RUNTIME.md` section 8 links
here; the player-facing movement contract it builds on is in `RUNTIME.md`
section 7.

An `agent` object is a walking NPC: a capsule that owns a waypoint follower and
paths over the same grid the player uses. It is authored in the Studio like any
other part and driven from Lua by id or display name.

| Call | Effect |
| --- | --- |
| `agent.moveTo(id, x, z, speed?)` | Starts a walk for that agent. `speed` is metres per second (default 4). Returns `false` when the agent or a route is missing |
| `agent.stop(id)` | Cancels that agent's walk where it stands |
| `agent.isMoving(id)` | `true` while that agent is walking |
| `agent.position(id)` | `{x, y, z}` of the agent, or `{0, 0, 0}` when the id does not resolve |

## Example

```lua
-- Patrol: walk four metres out and back, forever.
local me = script.parent
local home = { x = me.position.x, z = me.position.z }
local stride = 4
local leg = 0

script.onUpdate.Connect(function(dt)
    if agent.isMoving(me.id) then return end
    leg = leg + 1
    local offset = stride
    if leg % 2 == 0 then offset = -stride end
    agent.moveTo(me.id, home.x + offset, home.z, 3)
end)
```

`task.wait` schedules a callback; it does not suspend the script, so a patrol
loop written with `while true do ... task.wait(6) ... end` would spin. Drive
repeating movement from `script.onUpdate` and gate it on `agent.isMoving`.

## Contract

- `id` may be the object id (`script.parent.id`) or the display name. Names are
  not guaranteed unique, so prefer the id in scripts that ship.
- The walk ends at the **centre of the goal cell**, the same contract
  `player.moveTo` has: the pathfinder works in whole cells.
- Agents never block the nav grid and carry no physics body. They move
  kinematically, keep their authored `y`, and pass through the player and each
  other. Local avoidance between agents is not part of this surface.
- `agent.position` returns the origin for an unknown key instead of `nil`,
  because the Lua bridge cannot hand back a null value. Use
  `agent.isMoving(id)` when you need to know whether the key resolved.
- Without a bridge (a runtime that never wires agents) every call is a no-op,
  `isMoving` returns `false` and `position` returns the origin, so a script that
  drives NPCs still loads anywhere.
