// NumberSequence and ColorSequence value types for the Lua prelude.
//
// Injected before the user script marker so particle/VFX/UI curves and color
// ramps can be constructed and evaluated in Lua without JS boundary crossings.

export const SEQUENCES_PRELUDE = `NumberSequenceKeypoint = {}
function NumberSequenceKeypoint.new(time, value, envelope)
  return {
    Time = math.max(0, math.min(1, tonumber(time) or 0)),
    Value = tonumber(value) or 0,
    Envelope = tonumber(envelope) or 0
  }
end

local function readColor3(color)
  if color == nil then return { r = 1, g = 1, b = 1 } end
  local r = tonumber(color.r or color.R) or 0
  local g = tonumber(color.g or color.G) or 0
  local b = tonumber(color.b or color.B) or 0
  return {
    r = math.max(0, math.min(1, r)),
    g = math.max(0, math.min(1, g)),
    b = math.max(0, math.min(1, b))
  }
end

ColorSequenceKeypoint = {}
function ColorSequenceKeypoint.new(time, color)
  return {
    Time = math.max(0, math.min(1, tonumber(time) or 0)),
    Value = readColor3(color)
  }
end

local function findBracket(keypoints, alpha)
  local count = #keypoints
  if count == 0 then return nil, nil, 0 end
  local t = math.max(0, math.min(1, tonumber(alpha) or 0))
  if t <= keypoints[1].Time then return keypoints[1], keypoints[1], 0 end
  if t >= keypoints[count].Time then return keypoints[count], keypoints[count], 0 end
  for index = 1, count - 1 do
    local a, b = keypoints[index], keypoints[index + 1]
    if t >= a.Time and t <= b.Time then
      local span = b.Time - a.Time
      local frac = span > 1e-6 and ((t - a.Time) / span) or 0
      return a, b, frac
    end
  end
  return keypoints[count], keypoints[count], 0
end

local function buildKeypoints(arg1, arg2, makeKeypoint, copyKeypoint, defaultValue)
  local list = {}
  if type(arg1) == "table" and #arg1 > 0 then
    for _, kp in ipairs(arg1) do
      table.insert(list, copyKeypoint(kp))
    end
    table.sort(list, function(a, b) return a.Time < b.Time end)
    if #list == 1 then
      local only = list[1]
      list = { makeKeypoint(0, only.Value, only.Envelope), makeKeypoint(1, only.Value, only.Envelope) }
    end
    return list
  end
  local first = arg1 ~= nil and arg1 or defaultValue
  local second = arg2 ~= nil and arg2 or first
  return { makeKeypoint(0, first, 0), makeKeypoint(1, second, 0) }
end

NumberSequence = {}
function NumberSequence:Evaluate(alpha)
  local a, b, frac = findBracket(self.Keypoints, alpha)
  if a == nil then return 0 end
  return a.Value + (b.Value - a.Value) * frac
end

function NumberSequence.new(arg1, arg2)
  local keypoints = buildKeypoints(
    arg1, arg2,
    NumberSequenceKeypoint.new,
    function(kp)
      local t = kp.Time ~= nil and kp.Time or kp.time
      local v = kp.Value ~= nil and kp.Value or kp.value
      local e = kp.Envelope ~= nil and kp.Envelope or kp.envelope
      return NumberSequenceKeypoint.new(t, v, e)
    end,
    0
  )
  return {
    Keypoints = keypoints,
    Evaluate = NumberSequence.Evaluate
  }
end

ColorSequence = {}
function ColorSequence:Evaluate(alpha)
  local a, b, frac = findBracket(self.Keypoints, alpha)
  if a == nil then return { r = 1, g = 1, b = 1 } end
  return {
    r = a.Value.r + (b.Value.r - a.Value.r) * frac,
    g = a.Value.g + (b.Value.g - a.Value.g) * frac,
    b = a.Value.b + (b.Value.b - a.Value.b) * frac
  }
end

function ColorSequence.new(arg1, arg2)
  local keypoints = buildKeypoints(
    arg1, arg2,
    function(t, c) return ColorSequenceKeypoint.new(t, c) end,
    function(kp)
      local t = kp.Time ~= nil and kp.Time or kp.time
      local v = kp.Value ~= nil and kp.Value or kp.value
      return ColorSequenceKeypoint.new(t, v)
    end,
    { r = 1, g = 1, b = 1 }
  )
  return {
    Keypoints = keypoints,
    Evaluate = ColorSequence.Evaluate
  }
end
`;
