// TweenInfo and TweenService: the tween half of the script prelude.
//
// Split out of `luaPreludeServices.ts` when that file reached its line ceiling. It is a
// Lua string, not code.
//
// Every tween is driven from ONE handler per script rather than one per tween.
// `onUpdate.Connect` returns no connection to disconnect with, so a per-tween handler
// could never be removed and a game that opened a thousand doors would carry a thousand
// dead closures. A single driver keeps the cost bounded however many tweens run.
//
// The easing curves are in `luaPreludeEasing.ts`; they are locals, and this block is
// concatenated after them in the same chunk, so `ease` stays in scope.

import { EASING_PRELUDE } from './luaPreludeEasing';

export const TWEEN_PRELUDE = `${EASING_PRELUDE}

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

local warnedStyles = {}

local function styleName(value, fallback)
  if value == nil then return fallback end
  local name = tostring(value)
  local known = Enum.EasingStyle[name] ~= nil
  if not known and not warnedStyles[name] then
    warnedStyles[name] = true
    warn("Unknown easing style '" .. name .. "'; using " .. fallback)
  end
  return known and name or fallback
end

local function easeIn(style, t)
  if style == "Sine" then return 1 - math.cos(t * math.pi / 2) end
  if style == "Quad" then return t * t end
  if style == "Cubic" then return t * t * t end
  if style == "Quart" then return t * t * t * t end
  if style == "Quint" then return t ^ 5 end
  if style == "Back" then
    local c1 = 1.70158
    return (c1 + 1) * t * t * t - c1 * t * t
  end
  if style == "Elastic" then
    if t == 0 or t == 1 then return t end
    local c4 = (2 * math.pi) / 3
    return -(2 ^ (10 * t - 10)) * math.sin((t * 10 - 10.75) * c4)
  end
  if style == "Bounce" then
    local n1, d1 = 7.5625, 2.75
    local x = 1 - t
    if x < 1 / d1 then return 1 - n1 * x * x end
    if x < 2 / d1 then x = x - 1.5 / d1; return 1 - (n1 * x * x + 0.75) end
    if x < 2.5 / d1 then x = x - 2.25 / d1; return 1 - (n1 * x * x + 0.9375) end
    x = x - 2.625 / d1
    return 1 - (n1 * x * x + 0.984375)
  end
  return t * t
end

local function easeOut(style, t)
  if style == "Bounce" then return 1 - easeIn("Bounce", 1 - t) end
  if style == "Elastic" then
    if t == 0 or t == 1 then return t end
    local c4 = (2 * math.pi) / 3
    return (2 ^ (-10 * t)) * math.sin((t * 10 - 0.75) * c4) + 1
  end
  return 1 - easeIn(style, 1 - t)
end

-- Linear, then the three directions of every style. Back and Elastic overshoot on
-- purpose, so an Out curve can read above 1 mid-flight; only the endpoints are fixed.
local function ease(style, direction, t)
  local s = styleName(style, "Quad")
  if s == "Linear" then return t end
  local d = tostring(direction or "Out")
  if d == "In" then return easeIn(s, t) end
  if d == "InOut" then
    if t < 0.5 then return easeIn(s, t * 2) / 2 end
    return 1 - easeIn(s, (1 - t) * 2) / 2
  end
  return easeOut(s, t)
end

-- Vector3 and Color3 reach Lua as userdata, not tables, so nothing here may test
-- type(value) == "table" and expect to see them. capture and lerpValue both walk
-- these keys, so the list has to exist above them.
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
  -- An unknown property reads as nil. Capturing it would index nil below, so a typo in
  -- a tween goal would take the whole script down at Play time.
  if value == nil then return nil end
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
    playing = false,
    handlers = {}
  }

  local function complete()
    -- Copied first: a handler is allowed to disconnect while this loop runs.
    for _, entry in ipairs(tween.handlers) do
      if entry.live then
        local ok, err = pcall(entry.handler)
        if not ok then warn("Tween Completed handler failed: " .. tostring(err)) end
      end
    end
    local callback = tween.info.Completed
    if type(callback) == "function" then callback() end
  end

  tween.Completed = {
    Connect = function(...)
      local handler = nil
      for index = select("#", ...), 1, -1 do
        local value = select(index, ...)
        if type(value) == "function" then
          handler = value
          break
        end
      end
      if handler == nil then return { Disconnect = function() end } end
      local entry = { handler = handler, live = true }
      table.insert(tween.handlers, entry)
      return {
        Disconnect = function()
          entry.live = false
          for index = #tween.handlers, 1, -1 do
            if tween.handlers[index] == entry then table.remove(tween.handlers, index) end
          end
        end
      }
    end
  }

  function tween:Play()
    if self.playing or self.done or self.cancelled then return end
    if self.from == nil then
      self.from = {}
      -- Only keys the target actually has: anything else is a typo, and the goal is
      -- ignored for it rather than written back as a stray property.
      for key in pairs(self.goal) do
        local current = self.instance[key]
        if current ~= nil then self.from[key] = capture(current) end
      end
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

    -- DelayTime holds the tween still; the clock keeps running so the wait is not
    -- lost when a frame is long.
    local delay = tonumber(info.DelayTime) or 0
    if self.elapsed < delay then return end

    local duration = tonumber(info.Time) or 1
    local legs = info.Reverses and 2 or 1
    local cycles = math.max(0, math.floor(tonumber(info.RepeatCount) or 0)) + 1
    local total = duration * legs * cycles
    local active = self.elapsed - delay

    local progress
    local finished = false
    if active >= total then
      -- Land on the end value exactly. With Reverses the last leg is a backward one,
      -- so the tween ends where it started however many repeats ran.
      progress = info.Reverses and 0 or 1
      finished = true
    else
      local cycle = duration * legs
      if cycle <= 0 then
        progress = 1
      else
        local raw = (active % cycle) / duration
        progress = (info.Reverses and raw > 1) and (2 - raw) or math.min(raw, 1)
      end
    end

    local eased = ease(info.EasingStyle, info.EasingDirection, progress)
    for key, target in pairs(self.goal) do
      local from = self.from[key]
      if from ~= nil then self.instance[key] = lerpValue(from, target, eased) end
    end

    if finished then
      self.done = true
      self.playing = false
      complete()
    end
  end

  return tween
end
`;
