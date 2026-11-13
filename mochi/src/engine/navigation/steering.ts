// Steering behaviours for scripted movement.
//
// Pure 2D maths over XZ, no THREE and no engine coupling, so the same helpers
// serve the player's scripted walk today and agent entities later. Godot's RVO
// port (3.3) will consume `separation` output directly on the WASM side.

import { NavGrid } from './navGrid';

export interface SteeringVec2 {
  x: number;
  z: number;
}

export interface SteeringAgent {
  position: SteeringVec2;
  velocity: SteeringVec2;
  maxSpeed: number;
  radius: number;
}

export function distance2d(from: SteeringVec2, to: SteeringVec2): number {
  return Math.hypot(to.x - from.x, to.z - from.z);
}

/** Full-speed velocity toward the target. */
export function seek(position: SteeringVec2, target: SteeringVec2, maxSpeed: number): SteeringVec2 {
  const dx = target.x - position.x;
  const dz = target.z - position.z;
  const length = Math.hypot(dx, dz);
  if (length === 0 || maxSpeed <= 0) return { x: 0, z: 0 };
  return { x: (dx / length) * maxSpeed, z: (dz / length) * maxSpeed };
}

/**
 * Seek with a deceleration ramp inside `slowdownRadius`, so an agent eases into
 * its target instead of slamming into the last frame at full speed.
 */
export function arrive(
  position: SteeringVec2,
  target: SteeringVec2,
  maxSpeed: number,
  slowdownRadius: number
): SteeringVec2 {
  const distance = distance2d(position, target);
  if (distance === 0) return { x: 0, z: 0 };
  const ramped = maxSpeed * Math.min(distance / Math.max(slowdownRadius, 1e-6), 1);
  return seek(position, target, ramped);
}

/**
 * Repulsion from neighbours that overlap the agent's personal space. Weighted by
 * proximity so a distant crowd nudges gently and an imminent collision pushes
 * hard. Returns zero when nobody is within `radius`.
 */
export function separation(
  agent: SteeringAgent,
  neighbours: Array<{ position: SteeringVec2; radius: number }>,
  weight = 1
): SteeringVec2 {
  let sumX = 0;
  let sumZ = 0;

  for (const neighbour of neighbours) {
    const dx = agent.position.x - neighbour.position.x;
    const dz = agent.position.z - neighbour.position.z;
    const distance = Math.hypot(dx, dz);
    const overlap = agent.radius + neighbour.radius - distance;
    if (overlap <= 0 || distance === 0) continue;
    // Closest neighbours contribute the most; cap so a crowd cannot teleport.
    const strength = Math.min(overlap / (agent.radius + neighbour.radius), 1);
    sumX += (dx / distance) * strength;
    sumZ += (dz / distance) * strength;
  }

  const length = Math.hypot(sumX, sumZ);
  if (length === 0) return { x: 0, z: 0 };
  return { x: (sumX / length) * weight * agent.maxSpeed, z: (sumZ / length) * weight * agent.maxSpeed };
}

/**
 * Looks ahead along the current heading on the nav grid and returns a sideways
 * nudge when a blocked cell sits in the way. Zero when the lane is clear.
 */
export function avoidBlocked(
  grid: NavGrid,
  position: SteeringVec2,
  velocity: SteeringVec2,
  lookaheadCells = 2
): SteeringVec2 {
  const speed = Math.hypot(velocity.x, velocity.z);
  if (speed === 0) return { x: 0, z: 0 };

  const dirX = velocity.x / speed;
  const dirZ = velocity.z / speed;

  for (let step = 1; step <= Math.max(lookaheadCells, 1); step += 1) {
    const probeX = position.x + dirX * step * grid.cellSize;
    const probeZ = position.z + dirZ * step * grid.cellSize;
    const cell = grid.worldToCell(probeX, probeZ);
    if (!cell || grid.isWalkable(cell.x, cell.y)) continue;

    // Blocked ahead: slide along the nearer free side of the obstacle.
    const left = { x: -dirZ, z: dirX };
    const right = { x: dirZ, z: -dirX };
    const leftCell = grid.worldToCell(position.x + left.x * grid.cellSize, position.z + left.z * grid.cellSize);
    const rightCell = grid.worldToCell(position.x + right.x * grid.cellSize, position.z + right.z * grid.cellSize);
    const leftFree = leftCell ? grid.isWalkable(leftCell.x, leftCell.y) : false;
    const rightFree = rightCell ? grid.isWalkable(rightCell.x, rightCell.y) : false;
    const side = leftFree ? left : rightFree ? right : null;
    if (!side) return { x: 0, z: 0 };

    // Closer obstacles push harder.
    const urgency = 1 / step;
    return { x: side.x * speed * urgency, z: side.z * speed * urgency };
  }

  return { x: 0, z: 0 };
}

/** Adds two steering vectors, clamped to the agent's max speed. */
export function clampSpeed(vector: SteeringVec2, maxSpeed: number): SteeringVec2 {
  const length = Math.hypot(vector.x, vector.z);
  if (length <= maxSpeed || length === 0) return vector;
  return { x: (vector.x / length) * maxSpeed, z: (vector.z / length) * maxSpeed };
}
