// The Lua half of the script API: the parts that must live in Lua because they
// cooperate with coroutines.
//
// A script runs inside a coroutine so `task.wait` can suspend it and the host can
// resume it on a later frame. That is the whole point: the genre-standard loop
// patterns assume `task.wait` yields.

export const PRELUDE_MARKER = '-- __mochi_prelude_end';

const PRELUDE = `-- Mochi script prelude: coroutine-driven task library.
task = task or {}
function task.wait(seconds, fn)
  local delay = tonumber(seconds) or 0
  if delay < 0 then delay = 0 end
  -- Legacy two-argument form: task.wait(delay, callback) schedules the callback.
  if type(fn) == "function" then
    if __taskSchedule then __taskSchedule(delay, fn) end
    return delay
  end
  if coroutine.isyieldable() then
    return coroutine.yield(delay)
  end
  return delay
end
function task.delay(seconds, fn)
  if type(fn) == "function" and __taskSchedule then
    __taskSchedule(tonumber(seconds) or 0, fn)
  end
end
function task.spawn(fn)
  if type(fn) == "function" and __taskSchedule then __taskSchedule(0, fn) end
end
wait = task.wait
if script ~= nil then script.wait = task.wait end
-- CFrame: a position plus a row-major 3x3 rotation.
--
-- Defined in Lua rather than JS because the * operator needs a metamethod, and only
-- Lua can attach one. The matrix convention matches the engine (row-major, Euler XYZ),
-- so a CFrame a script writes lands where the collider says it should.
--
-- Every property and method is a RAW FIELD rather than an __index lookup. A CFrame
-- that crosses the JS boundary keeps its __mul metamethod but loses __index, so a
-- metatable-only surface would read as nil on exactly the value scripts get from
-- part.CFrame. Raw fields behave identically on both paths.
CFrame = {}
local cf_mt = {}

function CFrame:Inverse()
  local tx = -(self.m00 * self.x + self.m10 * self.y + self.m20 * self.z)
  local ty = -(self.m01 * self.x + self.m11 * self.y + self.m21 * self.z)
  local tz = -(self.m02 * self.x + self.m12 * self.y + self.m22 * self.z)
  return __mochi_cframe(tx, ty, tz,
    self.m00, self.m10, self.m20,
    self.m01, self.m11, self.m21,
    self.m02, self.m12, self.m22)
end

function CFrame:ToEulerAnglesXYZ()
  local sy = math.max(-1, math.min(1, self.m02))
  if math.abs(sy) < 0.999999 then
    return math.atan2(-self.m12, self.m22), math.asin(sy), math.atan2(-self.m01, self.m00)
  end
  local x = math.atan2(self.m10, self.m11)
  if sy < 0 then x = -x end
  return x, math.asin(sy), 0
end

function CFrame:Lerp(other, alpha)
  local t = math.max(0, math.min(1, tonumber(alpha) or 0))
  local function mix(a, b) return a + (b - a) * t end
  return __mochi_cframe(
    mix(self.x, other.x), mix(self.y, other.y), mix(self.z, other.z),
    mix(self.m00, other.m00), mix(self.m01, other.m01), mix(self.m02, other.m02),
    mix(self.m10, other.m10), mix(self.m11, other.m11), mix(self.m12, other.m12),
    mix(self.m20, other.m20), mix(self.m21, other.m21), mix(self.m22, other.m22))
end

-- The host builds a CFrame from a node's position and rotation through this.
function __mochi_cframe(x, y, z, m00, m01, m02, m10, m11, m12, m20, m21, m22)
  return setmetatable({
    x = x, y = y, z = z,
    m00 = m00, m01 = m01, m02 = m02,
    m10 = m10, m11 = m11, m12 = m12,
    m20 = m20, m21 = m21, m22 = m22,
    Position = Vector3.new(x, y, z),
    LookVector = Vector3.new(-m02, -m12, -m22),
    RightVector = Vector3.new(m00, m10, m20),
    UpVector = Vector3.new(m01, m11, m21),
    Inverse = CFrame.Inverse,
    Lerp = CFrame.Lerp,
    ToEulerAnglesXYZ = CFrame.ToEulerAnglesXYZ
  }, cf_mt)
end

function CFrame.new(x, y, z)
  return __mochi_cframe(tonumber(x) or 0, tonumber(y) or 0, tonumber(z) or 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1)
end

function CFrame.Angles(rx, ry, rz)
  local a, b = math.cos(rx or 0), math.sin(rx or 0)
  local c, d = math.cos(ry or 0), math.sin(ry or 0)
  local e, f = math.cos(rz or 0), math.sin(rz or 0)
  local ae, af, be, bf = a * e, a * f, b * e, b * f
  return __mochi_cframe(0, 0, 0,
    c * e, -c * f, d,
    af + be * d, ae - bf * d, -b * c,
    bf - ae * d, be + af * d, a * c)
end

cf_mt.__mul = function(a, b)
  return __mochi_cframe(
    a.x + a.m00 * b.x + a.m01 * b.y + a.m02 * b.z,
    a.y + a.m10 * b.x + a.m11 * b.y + a.m12 * b.z,
    a.z + a.m20 * b.x + a.m21 * b.y + a.m22 * b.z,
    a.m00 * b.m00 + a.m01 * b.m10 + a.m02 * b.m20,
    a.m00 * b.m01 + a.m01 * b.m11 + a.m02 * b.m21,
    a.m00 * b.m02 + a.m01 * b.m12 + a.m02 * b.m22,
    a.m10 * b.m00 + a.m11 * b.m10 + a.m12 * b.m20,
    a.m10 * b.m01 + a.m11 * b.m11 + a.m12 * b.m21,
    a.m10 * b.m02 + a.m11 * b.m12 + a.m12 * b.m22,
    a.m20 * b.m00 + a.m21 * b.m10 + a.m22 * b.m20,
    a.m20 * b.m01 + a.m21 * b.m11 + a.m22 * b.m21,
    a.m20 * b.m02 + a.m21 * b.m12 + a.m22 * b.m22)
end

${PRELUDE_MARKER}
__mochi_thread = coroutine.create(function()
`;

const EPILOGUE = `
end)
-- wasmoon hands back only the first value of a multi-return, so the step result
-- travels as one table.
function __mochi_step(...)
  local ok, value = coroutine.resume(__mochi_thread, ...)
  local status = coroutine.status(__mochi_thread)
  if not ok then
    return { ok = false, delay = 0, status = status, message = tostring(value) }
  end
  return { ok = true, delay = tonumber(value) or 0, status = status, message = "" }
end
`;

export interface ComposedScript {
  chunk: string;
  /** Lines the prelude added, so an error line can be mapped back to user code. */
  lineOffset: number;
}

/**
 * Wraps user code in a coroutine. `lineOffset` is how many lines precede it, which
 * is what turns a reported line number back into a line of the creator's script.
 */
export function composeScript(code: string): ComposedScript {
  const chunk = `${PRELUDE}${code}${EPILOGUE}`;
  return { chunk, lineOffset: PRELUDE.split('\n').length - 1 };
}
