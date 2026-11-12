// Shared touch rules for every session type: which trigger events count, how scripted
// touches are dispatched, and the built-in behaviour for coins, pads and hazards.
// Playtest and published games both go through this, so the two paths cannot drift.

import { PhysicsWorld, TriggerEvent } from '../physics';
import { AudioBus } from './audioBus';
import { GameState } from './gameState';
import { LiveNode } from './liveNode';
import { RuntimeWorld } from './objectRegistry';
import { RuntimePlayerHandle } from './types';

export interface TouchContext {
  world: RuntimeWorld;
  physics: PhysicsWorld;
  player: RuntimePlayerHandle;
  playerApi?: Record<string, unknown>;
  state: GameState;
  audio: AudioBus;
  /** Playtest drives the character controller directly instead of applying an impulse. */
  onJumpPad?: (node: LiveNode) => void;
}

/** Handles one physics trigger event for the local player. */
export function handlePlayerTrigger(event: TriggerEvent, playerBodyId: string, ctx: TouchContext): void {
  // `stay` would re-fire every frame and `exit` is not a touch.
  if (event.type !== 'enter') return;
  if (event.visitorBodyId !== playerBodyId) return;

  const node = ctx.world.getByBodyId(event.triggerBodyId);
  if (!node || node.destroyed) return;

  if (node.touchHandlerCount > 0 && ctx.playerApi) {
    node.emitTouch(ctx.playerApi);
  } else {
    applyDefaultTouch(node, ctx);
  }

  // A consumed collectible stops colliding so it cannot score twice.
  if (node.def.type === 'coin' && !node.visible && node.body) {
    ctx.physics.removeBody(node.body.id);
    node.body = null;
  }
}

/** Built-in behaviour for nodes that have no onTouch script attached. */
export function applyDefaultTouch(node: LiveNode, ctx: TouchContext): void {
  switch (node.def.type) {
    case 'coin':
      if (!node.visible) return;
      node.setVisible(false);
      ctx.state.addScore('Coins', 10);
      ctx.state.notify('+10 Coins');
      ctx.audio.play('coin_pickup', { position: node.position });
      break;
    case 'jump_pad':
      if (ctx.onJumpPad) ctx.onJumpPad(node);
      else ctx.player.applyImpulse(0, 18, 0);
      ctx.audio.play('jump_boost', { position: node.position });
      break;
    case 'hazard':
      ctx.player.respawn();
      ctx.audio.play('hazard', { position: node.position });
      ctx.state.notify('Respawned at spawn point');
      break;
    default:
      break;
  }
}
