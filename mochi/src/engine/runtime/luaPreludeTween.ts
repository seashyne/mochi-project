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

import { DAMP_PRELUDE } from './luaPreludeDamp';
import { TWEEN_VALUES_PRELUDE } from './luaPreludeTweenValues';
import { EASING_PRELUDE } from './luaPreludeEasing';

export const TWEEN_PRELUDE = `${EASING_PRELUDE}

${DAMP_PRELUDE}

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

${TWEEN_VALUES_PRELUDE}

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

-- The eased value for a normalised alpha, without a tween: useful for driving a value
-- by hand, and the way a script checks what a curve will do before committing to it.
function TweenService:GetValue(alpha, style, direction)
  return tweenValue(alpha, style, direction)
end

-- Follows a moving target without overshooting. The velocity comes back out and must be
-- passed in again next frame; that is what makes the motion continuous.
function TweenService:SmoothDamp(current, target, velocity, smoothTime, maxSpeed, dt)
  return __mochi_smooth_damp(current, target, velocity, smoothTime, maxSpeed, dt)
end

function TweenService:Create(instance, info, goal)
  local tween = {
    instance = instance,
    info = info or TweenInfo.new(),
    goal = goal or {},
    elapsed = 0,
    done = false,
    cancelled = false,
    PlaybackState = Enum.PlaybackState.Begin,
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
    local state = self.PlaybackState
    if state == Enum.PlaybackState.Playing or state == Enum.PlaybackState.Delayed then return end
    if state == Enum.PlaybackState.Completed or state == Enum.PlaybackState.Cancelled then return end
    if self.from == nil then
      self.from = {}
      -- Only keys the target actually has: anything else is a typo, and the goal is
      -- ignored for it rather than written back as a stray property.
      for key in pairs(self.goal) do
        local current = self.instance[key]
        if current ~= nil then self.from[key] = capture(current) end
      end
    end
    -- A newer tween on the same property replaces the older one, so two tweens cannot
    -- fight over one property and produce a value neither of them asked for.
    for index = #running, 1, -1 do
      local other = running[index]
      if other ~= self and other.instance == self.instance then
        for key in pairs(self.goal) do
          if other.goal[key] ~= nil then
            other:Cancel()
            break
          end
        end
      end
    end

    local delay = tonumber(self.info.DelayTime) or 0
    self.PlaybackState = delay > 0 and Enum.PlaybackState.Delayed or Enum.PlaybackState.Playing
    ensureDriver()
    table.insert(running, self)
  end

  function tween:Cancel()
    self.cancelled = true
    self.PlaybackState = Enum.PlaybackState.Cancelled
  end

  function tween:Pause()
    if self.PlaybackState == Enum.PlaybackState.Playing then
      self.PlaybackState = Enum.PlaybackState.Paused
    end
  end

  function tween:Resume()
    if self.PlaybackState == Enum.PlaybackState.Paused then
      self.PlaybackState = Enum.PlaybackState.Playing
    end
  end

  function tween:step(dt)
    local state = self.PlaybackState
    if state ~= Enum.PlaybackState.Playing and state ~= Enum.PlaybackState.Delayed then return end
    local info = self.info
    self.elapsed = self.elapsed + dt

    -- DelayTime holds the tween still; the clock keeps running so the wait is not
    -- lost when a frame is long.
    local delay = tonumber(info.DelayTime) or 0
    if self.elapsed < delay then return end
    self.PlaybackState = Enum.PlaybackState.Playing

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
      self.PlaybackState = Enum.PlaybackState.Completed
      complete()
    end
  end

  return tween
end
`;
