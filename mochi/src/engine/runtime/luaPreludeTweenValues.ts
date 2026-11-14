// Reading and blending the values a tween moves between.
//
// Split out of the tween prelude when that file reached its line ceiling. It is a Lua
// string, not code, and it is concatenated before the tween code so these locals are in
// scope there.
//
// The awkward part is that most of these values are userdata, not tables: Vector3,
// Color3, UDim and UDim2 all cross the boundary as objects that cannot be walked, so
// they are read by name. A CFrame is worse still - it carries x, y and z like a vector
// and a method call on userdata does not pass its arguments the way a table method does,
// which is why it is rebuilt as a real Lua CFrame before being lerped.

export const TWEEN_VALUES_PRELUDE = `-- Vector3, Color3, UDim and UDim2 reach Lua as userdata, which cannot be walked, so
-- they are read by name. capture and lerpValue both walk these keys, so the list has to
-- exist above them. It mirrors every value type the runtime hands to a script:
-- x/y/z for Vector3, r/g/b for Color3, and the UDim pair twice over for UDim2.
local VECTOR_KEYS = {
  "x", "y", "z",
  "r", "g", "b",
  "scale", "offset",
  "xScale", "xOffset", "yScale", "yOffset"
}

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

  -- Every numeric field, not a fixed list: a UDim2 is four numbers and a Color3 three,
  -- and a key list would silently skip whatever it did not know about. A Lua table can
  -- be walked; a Vector3 arrives as userdata, so it is read by name instead.
  local copy, found = {}, false
  if type(value) == "table" then
    for key, entry in pairs(value) do
      if type(entry) == "number" then
        copy[key] = entry
        found = true
      end
    end
  else
    for _, key in ipairs(VECTOR_KEYS) do
      local entry = value[key]
      if type(entry) == "number" then
        copy[key] = entry
        found = true
      end
    end
  end
  if found then return copy end
  return value
end

-- Numbers blend directly; a CFrame knows how to lerp itself, which keeps rotation on
-- the shortest arc instead of blending matrices; anything else blends every field the
-- two values share, which covers Vector3, Color3, UDim, UDim2 and Vector2 alike.
local function lerpValue(a, b, t)
  if type(a) == "number" and type(b) == "number" then return a + (b - a) * t end
  if isCFrame(a) then return a:Lerp(b, t) end

  local out, found = {}, false
  if type(a) == "table" then
    for key, from in pairs(a) do
      local target = b[key]
      if type(from) == "number" and type(target) == "number" then
        out[key] = from + (target - from) * t
        found = true
      elseif target ~= nil then
        out[key] = target
      else
        out[key] = from
      end
    end
  else
    for _, key in ipairs(VECTOR_KEYS) do
      local from, target = a[key], b[key]
      if type(from) == "number" and type(target) == "number" then
        out[key] = from + (target - from) * t
        found = true
      end
    end
  end
  if found then return out end
  return b
end
`;
