// Optimal Reciprocal Collision Avoidance, in the plane.
//
// The positional resolver in `localAvoidance.ts` fixes overlaps after they exist.
// ORCA works one step earlier: every neighbour contributes a half-plane in velocity
// space, and the agent takes the velocity closest to the one it wanted that stays
// outside all of them. Agents therefore start yielding before they touch, and two
// agents walking at each other choose opposite sides instead of locking - which is
// what the 8.5 degree bias in the positional pass had to work around.
//
// This is the RVO2 formulation: reciprocal half-planes, each side taking half the
// correction, with an immovable neighbour (the player, a prop) taking none.
//
// Deliberately no linearProgram3. That pass rescues the case where the feasible
// region collapses to a point; without static obstacles it is rare, and the failure
// is handled by keeping the last feasible velocity rather than by a repair pass.

export interface OrcaBody {
  x: number;
  z: number;
  vx: number;
  vz: number;
  radius: number;
  maxSpeed: number;
  /** 1 = free to move, 0 = immovable. The share of a correction is weight-relative. */
  weight: number;
}

export interface OrcaVelocity {
  vx: number;
  vz: number;
}

interface OrcaLine {
  /** A point on the boundary. */
  px: number;
  pz: number;
  /** Unit direction along the boundary. */
  dx: number;
  dz: number;
}

export interface OrcaOptions {
  /** Seconds of look-ahead for a potential collision. */
  timeHorizon?: number;
  /** Integration step, used when two discs already overlap. */
  timeStep?: number;
}

const EPSILON = 1e-5;

/** Half-planes constraining `index`, from every other body. */
function buildLines(bodies: OrcaBody[], index: number, timeHorizon: number, timeStep: number): OrcaLine[] {
  const self = bodies[index];
  const lines: OrcaLine[] = [];
  const invTimeHorizon = 1 / timeHorizon;

  for (let other = 0; other < bodies.length; other += 1) {
    if (other === index) continue;
    const neighbour = bodies[other];

    const relX = neighbour.x - self.x;
    const relZ = neighbour.z - self.z;
    const relVx = self.vx - neighbour.vx;
    const relVz = self.vz - neighbour.vz;
    const distSq = relX * relX + relZ * relZ;
    const combined = self.radius + neighbour.radius;
    const combinedSq = combined * combined;

    // A neighbour that cannot move takes none of the correction, so this side
    // absorbs all of it. Two movers split it evenly.
    const totalWeight = self.weight + neighbour.weight;
    const share = totalWeight > 0 ? self.weight / totalWeight : 0;

    let px: number;
    let pz: number;
    let dx: number;
    let dz: number;

    if (distSq > combinedSq) {
      // No overlap yet: constrain the velocity that would cause one within the
      // horizon. `w` is the relative velocity measured from the collision cone's
      // apex.
      const wX = relVx - invTimeHorizon * relX;
      const wZ = relVz - invTimeHorizon * relZ;
      const wLengthSq = wX * wX + wZ * wZ;
      const dot = wX * relX + wZ * relZ;

      if (dot < 0 && dot * dot > combinedSq * wLengthSq) {
        // Project onto the cut-off circle.
        const wLength = Math.sqrt(wLengthSq);
        const unitX = wX / wLength;
        const unitZ = wZ / wLength;
        dx = unitZ;
        dz = -unitX;
        const correction = combined * invTimeHorizon - wLength;
        px = self.vx + share * correction * unitX;
        pz = self.vz + share * correction * unitZ;
      } else {
        // Project onto one of the two legs of the collision cone.
        const leg = Math.sqrt(distSq - combinedSq);
        if (relX * wZ - relZ * wX > 0) {
          dx = (relX * leg - relZ * combined) / distSq;
          dz = (relX * combined + relZ * leg) / distSq;
        } else {
          dx = -(relX * leg + relZ * combined) / distSq;
          dz = -(-relX * combined + relZ * leg) / distSq;
        }
        const dot2 = relVx * dx + relVz * dz;
        px = self.vx + share * (dot2 * dx - relVx);
        pz = self.vz + share * (dot2 * dz - relVz);
      }
    } else {
      // Already overlapping: push out along the centre line within one step.
      const invTimeStep = 1 / timeStep;
      const wX = relVx - invTimeStep * relX;
      const wZ = relVz - invTimeStep * relZ;
      const wLength = Math.hypot(wX, wZ);
      if (wLength < EPSILON) {
        // Dead centre with identical velocities: no direction to push along.
        dx = 0;
        dz = 1;
        px = self.vx;
        pz = self.vz;
      } else {
        const unitX = wX / wLength;
        const unitZ = wZ / wLength;
        dx = unitZ;
        dz = -unitX;
        const correction = combined * invTimeStep - wLength;
        px = self.vx + share * correction * unitX;
        pz = self.vz + share * correction * unitZ;
      }
    }

    lines.push({ px, pz, dx, dz });
  }

  return lines;
}

function solveOnLine(
  lines: OrcaLine[],
  lineNo: number,
  radius: number,
  optVx: number,
  optVz: number,
  result: OrcaVelocity
): boolean {
  const line = lines[lineNo];
  const dot = line.px * line.dx + line.pz * line.dz;
  const discriminant = dot * dot + radius * radius - (line.px * line.px + line.pz * line.pz);
  if (discriminant < 0) return false;

  const root = Math.sqrt(discriminant);
  let left = -dot - root;
  let right = -dot + root;

  for (let index = 0; index < lineNo; index += 1) {
    const other = lines[index];
    const denominator = line.dx * other.dz - line.dz * other.dx;
    const numerator = other.dx * (line.pz - other.pz) - other.dz * (line.px - other.px);

    if (Math.abs(denominator) <= EPSILON) {
      if (numerator < 0) return false;
      continue;
    }

    const t = numerator / denominator;
    if (denominator >= 0) right = Math.min(right, t);
    else left = Math.max(left, t);
    if (left > right) return false;
  }

  const projected = line.dx * (optVx - line.px) + line.dz * (optVz - line.pz);
  const t = projected < left ? left : projected > right ? right : projected;
  result.vx = line.px + t * line.dx;
  result.vz = line.pz + t * line.dz;
  return true;
}

/**
 * Closest velocity to the preferred one that satisfies every half-plane, or the
 * last feasible candidate when the region is empty. Returns the number of lines
 * that were satisfied.
 */
function solveLines(lines: OrcaLine[], radius: number, optVx: number, optVz: number, result: OrcaVelocity): number {
  const speedSq = optVx * optVx + optVz * optVz;
  if (speedSq > radius * radius) {
    const scale = radius / Math.sqrt(speedSq);
    result.vx = optVx * scale;
    result.vz = optVz * scale;
  } else {
    result.vx = optVx;
    result.vz = optVz;
  }

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (line.dx * (line.pz - result.vz) - line.dz * (line.px - result.vx) <= 0) continue;
    const previous = { vx: result.vx, vz: result.vz };
    if (!solveOnLine(lines, index, radius, optVx, optVz, result)) {
      result.vx = previous.vx;
      result.vz = previous.vz;
      return index;
    }
  }

  return lines.length;
}

/**
 * Solves every movable body at once. Immovable bodies keep their velocity and only
 * act as constraints, which is what makes the player a wall agents flow around.
 */
export function solveOrca(bodies: OrcaBody[], options: OrcaOptions = {}): OrcaVelocity[] {
  const timeHorizon = options.timeHorizon ?? 2;
  const timeStep = options.timeStep ?? 1 / 60;
  const solved: OrcaVelocity[] = bodies.map((body) => ({ vx: body.vx, vz: body.vz }));

  for (let index = 0; index < bodies.length; index += 1) {
    const body = bodies[index];
    if (body.weight <= 0) continue;

    // solveLines clamps to maxSpeed even with no constraints, so a lone agent
    // that was handed an impossible velocity still comes back legal.
    const lines = buildLines(bodies, index, timeHorizon, timeStep);
    const result: OrcaVelocity = { vx: body.vx, vz: body.vz };
    solveLines(lines, body.maxSpeed, body.vx, body.vz, result);
    solved[index] = result;
  }

  return solved;
}
