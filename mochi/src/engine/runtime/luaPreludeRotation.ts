// Rotation interpolation for CFrame.
//
// `CFrame:Lerp` used to blend the nine matrix components directly, which is only correct
// when the two rotations are nearly identical. Halfway through a 180 degree turn every
// component lands on zero - the basis collapses and the part vanishes at the midpoint -
// and halfway through 90 degrees the basis is not unit length, so the part visibly
// shrinks and grows on the way.
//
// Rotation has to be interpolated on the sphere. This converts each frame to a
// quaternion, slerps along the shortest arc, and converts back.
//
// Kept out of `luaPrelude.ts`, which is at its line ceiling. The function is a global so
// the CFrame block, defined in another module, can call it.

export const ROTATION_PRELUDE = `-- Row-major matrix to quaternion (Shepperd). Picks the largest diagonal term so the
-- square root never takes a value near zero.
-- Global, not local: the damping code in the service prelude runs earlier in the
-- chunk and needs to read a frame's rotation.
function __mochi_quat_from(m)
  local trace = m.m00 + m.m11 + m.m22
  local x, y, z, w
  if trace > 0 then
    local s = math.sqrt(trace + 1) * 2
    w = 0.25 * s
    x = (m.m21 - m.m12) / s
    y = (m.m02 - m.m20) / s
    z = (m.m10 - m.m01) / s
  elseif m.m00 > m.m11 and m.m00 > m.m22 then
    local s = math.sqrt(1 + m.m00 - m.m11 - m.m22) * 2
    w = (m.m21 - m.m12) / s
    x = 0.25 * s
    y = (m.m01 + m.m10) / s
    z = (m.m02 + m.m20) / s
  elseif m.m11 > m.m22 then
    local s = math.sqrt(1 + m.m11 - m.m00 - m.m22) * 2
    w = (m.m02 - m.m20) / s
    x = (m.m01 + m.m10) / s
    y = 0.25 * s
    z = (m.m12 + m.m21) / s
  else
    local s = math.sqrt(1 + m.m22 - m.m00 - m.m11) * 2
    w = (m.m10 - m.m01) / s
    x = (m.m02 + m.m20) / s
    y = (m.m12 + m.m21) / s
    z = 0.25 * s
  end
  return x, y, z, w
end

-- Shortest-arc slerp. Flipping the second quaternion when the dot product is negative
-- is what makes the tween take the short way round instead of the long one.
local function __mochi_slerp(a, b, t)
  local ax, ay, az, aw = a[1], a[2], a[3], a[4]
  local bx, by, bz, bw = b[1], b[2], b[3], b[4]
  local dot = ax * bx + ay * by + az * bz + aw * bw
  if dot < 0 then
    bx, by, bz, bw = -bx, -by, -bz, -bw
    dot = -dot
  end
  if dot > 0.9995 then
    -- Nearly the same rotation: a straight blend is stable and indistinguishable.
    local x, y, z, w = ax + (bx - ax) * t, ay + (by - ay) * t,
      az + (bz - az) * t, aw + (bw - aw) * t
    local length = math.sqrt(x * x + y * y + z * z + w * w)
    if length == 0 then return a end
    return { x / length, y / length, z / length, w / length }
  end
  local theta = math.acos(math.max(-1, math.min(1, dot)))
  local sinTheta = math.sin(theta)
  local left = math.sin((1 - t) * theta) / sinTheta
  local right = math.sin(t * theta) / sinTheta
  return {
    ax * left + bx * right,
    ay * left + by * right,
    az * left + bz * right,
    aw * left + bw * right
  }
end

-- Quaternion back to a row-major frame, with the position blended straight.
function __mochi_slerp_frame(a, b, t)
  if t <= 0 then return a end
  if t >= 1 then return b end
  local q = __mochi_slerp(
    { __mochi_quat_from(a) },
    { __mochi_quat_from(b) },
    t
  )
  local x, y, z, w = q[1], q[2], q[3], q[4]
  local mix = function(p, r) return p + (r - p) * t end
  return __mochi_cframe(
    mix(a.x, b.x), mix(a.y, b.y), mix(a.z, b.z),
    1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w),
    2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w),
    2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y))
end
`;
