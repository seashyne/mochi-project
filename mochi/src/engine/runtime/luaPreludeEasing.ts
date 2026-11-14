// The easing curves of the script prelude.
//
// Split out of `luaPreludeServices.ts` when that file reached its line ceiling. It is a
// Lua string, not code. The names are locals, and the tween code is concatenated after
// them in the same chunk, so they stay in scope.

export const EASING_PRELUDE = `-- Easing names a script may pass to TweenInfo. They are strings for the same reason
-- Enum.Material is: a member that does not exist reads as nil and fails loudly.
Enum = Enum or {}
Enum.EasingStyle = {
  Linear = "Linear", Sine = "Sine", Quad = "Quad", Cubic = "Cubic",
  Quart = "Quart", Quint = "Quint", Bounce = "Bounce", Elastic = "Elastic",
  Back = "Back"
}
Enum.EasingDirection = { In = "In", Out = "Out", InOut = "InOut" }

-- What a tween is doing, so a script can read it rather than guess.
Enum.PlaybackState = {
  Begin = "Begin", Delayed = "Delayed", Playing = "Playing",
  Paused = "Paused", Completed = "Completed", Cancelled = "Cancelled"
}

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

-- The eased value for a normalised alpha: TweenService:GetValue without a tween.
local function tweenValue(alpha, style, direction)
  local value = tonumber(alpha) or 0
  if value < 0 then value = 0 elseif value > 1 then value = 1 end
  return ease(style, direction, value)
end
`;
