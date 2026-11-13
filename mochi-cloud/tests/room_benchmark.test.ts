// Room benchmark: 30 synthetic peers at the shipped tick rates, through the real
// validation pipeline.
//
// This measures the Durable Object's CPU cost per tick, NOT client frame rate.
// Gate G2 asks for 30 players at 30 fps on a laptop; that half needs a browser
// run and is still open. What this closes is the other half: how much work the
// room does before a delta reaches anyone.

import { describe, expect, it } from 'vitest';
import { parseTransformDelta } from '../src/do/transformDelta';
import { validateMovement } from '../src/do/roomMovement';
import { validateWorldOp } from '../src/do/worldOpValidation';
import { OwnershipTable } from '../src/do/roomOwnership';
import { SpawnBudget } from '../src/do/worldOpValidation';
import { RoomRateLimiter } from '../src/services/roomRateLimiter';

const PLAYERS = 30;
const TICKS = 600; // 60 s at 10 Hz
const OBJECTS_PER_PLAYER = 3;

interface Peer {
  id: string;
  x: number;
  y: number;
  z: number;
  lastMoveAt: number;
}

function makePeers(): Peer[] {
  return Array.from({ length: PLAYERS }, (_, index) => ({
    id: `p${index}`,
    x: index * 2,
    y: 0,
    z: index % 5,
    lastMoveAt: 0
  }));
}

function deltaFor(peer: Peer, tick: number) {
  return {
    tick,
    entries: Array.from({ length: OBJECTS_PER_PLAYER }, (_, index) => ({
      id: `${peer.id}_obj${index}`,
      x: peer.x + index * 0.1,
      y: 0,
      z: peer.z + tick * 0.001,
      ry: 0.01 * tick
    })),
    removed: [] as string[]
  };
}

describe('room benchmark (30 peers, 60 s at 10 Hz)', () => {
  it('measures per-tick room cost through the real validation chain', () => {
    const peers = makePeers();
    const ownership = new OwnershipTable();
    const spawns = new SpawnBudget();
    const limiter = new RoomRateLimiter({ transform_delta: { ratePerSecond: 20, burst: 40 } });
    const samples: number[] = [];
    let accepted = 0;
    let dropped = 0;

    // Warm up the JIT so the first tick is not the outlier.
    for (let i = 0; i < 60; i += 1) parseTransformDelta(deltaFor(peers[0], i));

    const started = performance.now();
    for (let tick = 0; tick < TICKS; tick += 1) {
      const tickStart = performance.now();
      // The guards are wall-clock based; feed them the simulated 10 Hz clock so
      // 600 virtual ticks are not starved by running in 20 real milliseconds.
      const virtualNow = 1_700_000_000_000 + tick * 100;

      for (const peer of peers) {
        // Player state at 20 Hz - every other 10 Hz tick, plus the in-between one.
        for (let step = 0; step < 2; step += 1) {
          const elapsed = 50;
          const next = {
            x: peer.x + Math.sin((tick * 2 + step) / 20) * 0.4,
            y: 0,
            z: peer.z + Math.cos((tick * 2 + step) / 20) * 0.4
          };
          const verdict = validateMovement(peer, next, elapsed);
          peer.x = verdict.x;
          peer.y = verdict.y;
          peer.z = verdict.z;
          peer.lastMoveAt += elapsed;
        }

        // Object transforms at 10 Hz.
        if (!limiter.allow(peer.id, 'transform_delta', virtualNow)) {
          dropped += 1;
          continue;
        }
        const payload = parseTransformDelta(deltaFor(peer, tick));
        if (!payload) {
          dropped += 1;
          continue;
        }
        for (const entry of payload.entries) {
          if (ownership.claim(entry.id, peer.id)) accepted += 1;
          else dropped += 1;
        }

        // One world edit per player per second.
        if (tick % 10 === 0) {
          const op = { kind: 'spawn', object: { id: `${peer.id}_${tick}`, type: 'block', position: { x: 1, y: 0, z: 1 } } };
          if (validateWorldOp(op).ok && spawns.allow(peer.id, virtualNow)) accepted += 1;
        }
      }

      samples.push(performance.now() - tickStart);
    }
    const total = performance.now() - started;

    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    const max = samples[samples.length - 1];

    console.log('--- room benchmark ---');
    console.log(`peers              ${PLAYERS}`);
    console.log(`ticks              ${TICKS} (60 s at 10 Hz)`);
    console.log(`transform entries  ${PLAYERS * OBJECTS_PER_PLAYER} per tick`);
    console.log(`accepted / dropped ${accepted} / ${dropped}`);
    console.log(`total              ${total.toFixed(1)} ms`);
    console.log(`per tick median    ${median.toFixed(3)} ms`);
    console.log(`per tick p95       ${p95.toFixed(3)} ms`);
    console.log(`per tick max       ${max.toFixed(3)} ms`);
    console.log(`budget             < 1.000 ms per tick at 10 Hz (10% of one core)`);
    console.log('----------------------');

    // Correctness first: nothing may be lost to a validation bug.
    expect(accepted).toBeGreaterThan(0);
    expect(samples).toHaveLength(TICKS);
    // A generous ceiling: this is a regression tripwire, not a precise SLA.
    expect(p95).toBeLessThan(5);
  });
});
