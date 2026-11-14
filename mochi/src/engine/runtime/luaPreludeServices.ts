// The service layer of the script prelude.
//
// Split out of `luaPrelude.ts` when that file reached its line ceiling. It is a Lua
// string, not code.

export const SERVICES_PRELUDE = `-- Services. Only the part of the service layer that is really a per-frame event.
--
-- Heartbeat and RenderStepped fire once per frame with the frame delta, which is
-- exactly what the node update handler already does, so they alias it. They cannot be
-- a spawned loop: task.spawn schedules a timer on the main thread, where task.wait
-- cannot yield, so a loop written that way would spin forever and freeze the session.
RunService = RunService or {}
RunService.IsClient = true
RunService.IsServer = false
RunService.IsStudio = false
if script ~= nil and script.onUpdate ~= nil then
  RunService.Heartbeat = script.onUpdate
  RunService.RenderStepped = script.onUpdate
end
`;
