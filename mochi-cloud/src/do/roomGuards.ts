// Per-room validation state. Grouped so GameRoomDO declares one field instead of
// four, and so the set of guards is visible in one place.

import { OwnershipTable } from './roomOwnership';
import { SpawnBudget } from './worldOpValidation';
import { ScoreGuard } from './scoreGuard';
import { InterestIndex } from './roomInterest';

export interface RoomGuards {
  ownership: OwnershipTable;
  spawnBudget: SpawnBudget;
  scoreGuard: ScoreGuard;
  interest: InterestIndex;
}

export function createRoomGuards(): RoomGuards {
  return {
    ownership: new OwnershipTable(),
    spawnBudget: new SpawnBudget(),
    scoreGuard: new ScoreGuard(),
    interest: new InterestIndex()
  };
}

/** Releases everything a disconnected player owns or occupies. */
export function releasePlayerGuards(guards: RoomGuards, playerId: string): void {
  guards.ownership.dropPlayer(playerId);
  guards.spawnBudget.release(playerId);
  guards.scoreGuard.release(playerId);
  guards.interest.remove(playerId);
}
