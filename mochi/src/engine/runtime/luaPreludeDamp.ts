// `TweenService:SmoothDamp` - a critically damped spring.
//
// TweenService itself is a tween with a fixed duration; this is the other half of the
// pair, for something that follows a target every frame (a camera, a follower) and must
// never overshoot. The caller feeds the returned velocity back in on the next call, which
// is what keeps the motion continuous instead of restarting from rest each frame.
//
// Numbers and Vector3 are supported. A CFrame is rejected out loud rather than being
// treated as a Vector3: it carries x, y and z, so a silent fallback would damp only the
// position and leave the rotation untouched - which looks like the feature works.

export const DAMP_PRELUDE = `local function __mochi_damp_scalar(current, target, velocity, smoothTime, maxSpeed, dt)
  -- Unity's critically damped spring, which is what this shape of API comes from.
  local omega = 2 / math.max(0.0001, smoothTime)
  local x = omega * dt
  local decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x)

  local change = current - target
  local maxChange = maxSpeed * smoothTime
  if maxChange > 0 and maxChange < math.huge then
    change = math.max(-maxChange, math.min(maxChange, change))
  end

  local temp = (velocity + omega * change) * dt
  local nextVelocity = (velocity - omega * temp) * decay
  local output = (current - change) + (change + temp) * decay

  -- If the step carried the value past the target, land on the target and stop: the
  -- spring is not allowed to overshoot.
  if (target - current > 0) == (output > target) then
    output = target
    nextVelocity = 0
  end
  return output, nextVelocity
end

-- A CFrame is damped as two quantities: the position, component by component, and the
-- angle left to turn. The axis is recomputed every call from where the frame is pointing
-- and where it should point, so only the angular *speed* has to be carried between calls.
--
-- The velocity this returns is a table, not a CFrame: Position is the linear velocity
-- and Angular is radians per second. A CFrame cannot carry both without an encoding
-- that loses magnitude, and a lossy round trip is worse than a shape that says what it
-- holds. Feed the whole table back in next frame.
function __mochi_smooth_damp_frame(current, target, velocity, smoothTime, maxSpeed, dt)
  local linear = type(velocity) == "table" and velocity.Position or nil
  local angular = type(velocity) == "table" and tonumber(velocity.Angular) or 0

  local function axis(key)
    local from = tonumber(current[key]) or 0
    local to = tonumber(target and target[key]) or from
    local speed = tonumber(linear and linear[key]) or 0
    return __mochi_damp_scalar(from, to, speed, smoothTime, maxSpeed, dt)
  end

  local x, vx = axis("x")
  local y, vy = axis("y")
  local z, vz = axis("z")

  local from = { __mochi_quat_from(current) }
  local to = { __mochi_quat_from(target) }
  local dot = from[1] * to[1] + from[2] * to[2] + from[3] * to[3] + from[4] * to[4]
  local angle = 2 * math.acos(math.max(-1, math.min(1, math.abs(dot))))

  local nextAngle, nextAngular = __mochi_damp_scalar(angle, 0, angular, smoothTime, maxSpeed, dt)
  local fraction = angle > 1e-6 and (1 - nextAngle / angle) or 0
  local turned = __mochi_slerp_frame(current, target, fraction)

  return __mochi_cframe(x, y, z,
      turned.m00, turned.m01, turned.m02,
      turned.m10, turned.m11, turned.m12,
      turned.m20, turned.m21, turned.m22),
    { Position = Vector3.new(vx, vy, vz), Angular = nextAngular }
end

function __mochi_smooth_damp(current, target, velocity, smoothTime, maxSpeed, dt)
  local smooth = tonumber(smoothTime) or 0.3
  local step = tonumber(dt) or (1 / 60)
  local cap = tonumber(maxSpeed) or math.huge

  if type(current) == "number" then
    return __mochi_damp_scalar(
      current,
      tonumber(target) or current,
      tonumber(velocity) or 0,
      smooth, cap, step
    )
  end

  if current == nil then
    error("SmoothDamp needs a current value", 2)
  end

  if current.m00 ~= nil then
    return __mochi_smooth_damp_frame(current, target, velocity, smooth, cap, step)
  end

  local function axis(key)
    local from = tonumber(current[key]) or 0
    local to = tonumber(target and target[key]) or from
    local speed = tonumber(velocity and velocity[key]) or 0
    return __mochi_damp_scalar(from, to, speed, smooth, cap, step)
  end

  local x, vx = axis("x")
  local y, vy = axis("y")
  local z, vz = axis("z")
  return Vector3.new(x, y, z), Vector3.new(vx, vy, vz)
end
`;
