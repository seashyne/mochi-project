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

  if current == nil or current.m00 ~= nil then
    error("SmoothDamp supports a number or a Vector3, not a CFrame", 2)
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
