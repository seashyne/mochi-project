// The `player` proxy: the local character as scripts see it.
//
// Split from luaNodeApi so the node, player and world proxies stay readable and each
// stays under the file-size ceiling.

import { defineAlias } from './luaProxyUtils';
import type { RuntimeApiDeps } from './luaNodeApi';
import { toVec3 } from './types';

/** Player proxy backed by the real character controller. */
export function createPlayerApi(deps: RuntimeApiDeps): Record<string, unknown> {
  const api: Record<string, unknown> = {};
  defineAlias(api, ['position', 'Position'], () => deps.player.getPosition(), (value) => {
    const vec = toVec3(value);
    deps.player.setPosition(vec.x, vec.y, vec.z);
  });
  defineAlias(api, ['health', 'Health'], () => deps.player.getHealth(), (value) => {
    deps.player.setHealth(Number(value) || 0);
  });
  defineAlias(api, ['maxHealth', 'MaxHealth'], () => deps.player.getMaxHealth(), () => undefined);
  defineAlias(api, ['name', 'Name', 'username', 'Username'], () => deps.player.name, () => undefined);
  api.id = deps.player.id;

  api.addScore = (category: unknown, amount: unknown) => {
    const label = String(category ?? 'Score');
    const total = deps.state.addScore(label, Number(amount) || 0);
    deps.log('info', `Score ${label} = ${total} (+${Number(amount) || 0})`, 'player');
    return total;
  };
  api.getScore = (category: unknown) => deps.state.getScore(String(category ?? 'Score'));
  api.setVelocity = (x: unknown, y: unknown, z: unknown) => deps.player.setVelocity(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  api.applyImpulse = (x: unknown, y: unknown, z: unknown) => deps.player.applyImpulse(Number(x) || 0, Number(y) || 0, Number(z) || 0);
  api.respawn = () => {
    deps.player.respawn();
    deps.audio.play('swoosh');
  };
  api.damage = (amount: unknown) => deps.player.damage(Number(amount) || 0);
  api.heal = (amount: unknown) => deps.player.heal(Number(amount) || 0);
  // Scripted walking through the navigation grid; no-ops without a bridge.
  api.moveTo = (x: unknown, z: unknown, speed?: unknown) => {
    const targetX = Number(x);
    const targetZ = Number(z);
    if (!Number.isFinite(targetX) || !Number.isFinite(targetZ)) return false;
    const started = deps.navigation?.moveTo(targetX, targetZ, Number(speed)) ?? false;
    deps.log('info', `[Nav] moveTo(${targetX}, ${targetZ}) ${started ? 'started' : 'unreachable'}`, 'player');
    return started;
  };
  api.stopMoving = () => deps.navigation?.stop();
  api.isMoving = () => deps.navigation?.isMoving() ?? false;
  return api;
}
