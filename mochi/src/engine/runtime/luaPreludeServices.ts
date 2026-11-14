// The service layer of the script prelude.
//
// Split out of `luaPrelude.ts` when that file reached its line ceiling. It is a Lua
// string, not code.
//
// TweenService drives every tween from ONE handler per script rather than one per
// tween. `onUpdate.Connect` returns no connection to disconnect with, so a per-tween
// handler could never be removed and a game that opened a thousand doors would carry a
// thousand dead closures. A single driver keeps the cost bounded no matter how many
// tweens run.

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

-- Easing names a script may pass to TweenInfo. They are strings for the same reason
-- Enum.Material is: a member that does not exist reads as nil and fails loudly.
Enum = Enum or {}
Enum.EasingStyle = {
  Linear = "Linear", Sine = "Sine", Quad = "Quad", Cubic = "Cubic",
  Quart = "Quart", Quint = "Quint", Bounce = "Bounce", Elastic = "Elastic",
  Back = "Back"
}
Enum.EasingDirection = { In = "In", Out = "Out", InOut = "InOut" }

TweenInfo = {}
function TweenInfo.new(time, style, direction, repeatCount, reverses, delay)
  return {
    Time = tonumber(time) or 1,
    EasingStyle = style or Enum.EasingStyle.Quad,
    EasingDirection = direction or Enum.EasingDirection.Out,
    RepeatCount = tonumber(repeatCount) or 0,
    Reverses = reverses == true,
    DelayTime = tonumber(delay) or 0
  }
end

local function ease(style, direction, t)
  local s = tostring(style or "Linear")
  local d = tostring(direction or "Out")
  if s == "Linear" then return t end
  if d == "In" then
    if s == "Sine" then return 1 - math.cos(t * math.pi / 2) end
    if s == "Cubic" then return t * t * t end
    return t * t
  end
  if d == "InOut" then
    if s == "Sine" then return 0.5 * (1 - math.cos(math.pi * t)) end
    if t < 0.5 then return 2 * t * t end
    return 1 - ((2 - 2 * t) * (2 - 2 * t)) / 2
  end
  if s == "Sine" then return math.sin(t * math.pi / 2) end
  if s == "Cubic" then return 1 - (1 - t) * (1 - t) * (1 - t) end
  return 1 - (1 - t) * (1 - t)
end

-- Vector3 and Color3 reach Lua as userdata, not tables, so nothing here may test
-- type(value) == "table" and expect to see them.
local VECTOR_KEYS = { "x", "y", "z", "r", "g", "b" }

-- A CFrame carries x, y and z as well, so it has to be recognised before the vector
-- keys are read or it looks like a Vector3 and the tween silently writes nothing.
local function isCFrame(value)
  return value ~= nil and value.m00 ~= nil and value.Lerp ~= nil
end

-- A CFrame read off a part comes back as userdata, and a method call on userdata does
-- not pass its arguments the way a table method does. Rebuild it as a real Lua CFrame
-- from its fields, which is what makes :Lerp work on it.
local function asLuaCFrame(value)
  if type(value) == "table" then return value end
  if not isCFrame(value) then return nil end
  return __mochi_cframe(value.x, value.y, value.z,
    value.m00, value.m01, value.m02,
    value.m10, value.m11, value.m12,
    value.m20, value.m21, value.m22)
end

local function capture(value)
  if type(value) == "number" then return value end
  if isCFrame(value) then return asLuaCFrame(value) end
  local copy = {}
  local found = false
  for _, key in ipairs(VECTOR_KEYS) do
    local entry = value[key]
    if type(entry) == "number" then
      copy[key] = entry
      found = true
    end
  end
  if found then return copy end
  return value
end

-- Numbers tween directly; a CFrame knows how to lerp itself, which keeps rotation on
-- the shortest arc instead of blending matrices; anything else blends its numeric
-- fields, which is what Vector3 and Color3 need.
local function lerpValue(a, b, t)
  if type(a) == "number" and type(b) == "number" then return a + (b - a) * t end
  if isCFrame(a) then return a:Lerp(b, t) end
  local out = {}
  local found = false
  for _, key in ipairs(VECTOR_KEYS) do
    local from, target = a[key], b[key]
    if type(from) == "number" and type(target) == "number" then
      out[key] = from + (target - from) * t
      found = true
    end
  end
  if found then return out end
  return b
end

local running = {}
local driving = false

local function drive(dt)
  local index = 1
  while index <= #running do
    local tween = running[index]
    if tween.done or tween.cancelled then
      table.remove(running, index)
    else
      tween:step(dt)
      index = index + 1
    end
  end
end

local function ensureDriver()
  if driving or script == nil or script.onUpdate == nil then return end
  driving = true
  script.onUpdate.Connect(function(dt) drive(dt) end)
end

TweenService = {}
function TweenService:Create(instance, info, goal)
  local tween = {
    instance = instance,
    info = info or TweenInfo.new(),
    goal = goal or {},
    elapsed = 0,
    done = false,
    cancelled = false,
    playing = false
  }

  function tween:Play()
    if self.playing or self.done or self.cancelled then return end
    if self.from == nil then
      self.from = {}
      for key in pairs(self.goal) do self.from[key] = capture(self.instance[key]) end
    end
    self.playing = true
    ensureDriver()
    table.insert(running, self)
  end

  function tween:Cancel()
    self.cancelled = true
    self.playing = false
  end

  function tween:step(dt)
    if not self.playing then return end
    local info = self.info
    self.elapsed = self.elapsed + dt
    local duration = tonumber(info.Time) or 1
    local progress = duration > 0 and math.min(1, self.elapsed / duration) or 1
    local eased = ease(info.EasingStyle, info.EasingDirection, progress)
    for key, target in pairs(self.goal) do
      self.instance[key] = lerpValue(self.from[key], target, eased)
    end
    if progress >= 1 then
      self.done = true
      self.playing = false
      local completed = info.Completed
      if type(completed) == "function" then completed() end
    end
  end

  return tween
end
`;
