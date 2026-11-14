// The `player` proxy: the local character as scripts see it.
//
// Split from luaNodeApi so the node, player and world proxies stay readable and each
// stays under the file-size ceiling.

import { defineAlias } from './luaProxyUtils';
import type { RuntimeApiDeps } from './luaNodeApi';
import { createPlayerGuiProxy } from './luaGuiApi';
import { toVec3 } from './types';

/** Metres per second a scripted walk uses when the script names no speed. */
export const DEFAULT_WALK_SPEED = 4;

/** The Lua-visible half of a signal: `:Connect(fn)` returns something with
 *  `:Disconnect()`. Firing stays non-enumerable so it is not part of the surface. */
function createSignal(
  label: string,
  log: (level: 'info' | 'warn' | 'error', message: string) => void
): { signal: Record<string, unknown>; fire: () => void } {
  const handlers = new Set<() => void>();
  const signal: Record<string, unknown> = {};

  signal.Connect = (...raw: unknown[]) => {
    // Take the first function argument rather than the first argument: a colon call
    // hands over a proxy of this table, and whether it is identity-equal to `signal`
    // depends on how the host marshals it. Looking for the callback sidesteps that.
    const handler = raw.find((value) => typeof value === 'function');
    if (!handler) return { Disconnect: () => undefined };
    const callback = handler as () => void;
    handlers.add(callback);
    return { Disconnect: () => handlers.delete(callback) };
  };

  const fire = () => {
    // Copy first: a handler is allowed to disconnect itself or its neighbour.
    for (const handler of [...handlers]) {
      try {
        handler();
      } catch (error) {
        log('error', `${label} handler failed: ${(error as Error)?.message ?? error}`);
      }
    }
  };

  Object.defineProperty(signal, 'fire', { value: fire, enumerable: false });
  return { signal, fire };
}

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
  // The root a ScreenGui hangs from. Cached, so two scripts see the same table.
  defineAlias(api, ['PlayerGui', 'playerGui'], () => createPlayerGuiProxy(), () => undefined);

  // `player.Character.Humanoid` - the shape avatar scripts reach for. The controller
  // is not an Instance tree, so this is a table with the same property names, not a
  // parented instance; `FindFirstChild` and friends do not apply.
  let walkSpeed = DEFAULT_WALK_SPEED;
  const humanoid: Record<string, unknown> = {};
  // A colon call passes the table itself as the first argument and a dot call does
  // not. Accepting both keeps `humanoid:MoveTo(p)` and `humanoid.MoveTo(p)` working
  // instead of making the difference a rule the script has to know.
  const afterSelf = (args: unknown[]): unknown[] => (args[0] === humanoid ? args.slice(1) : args);

  defineAlias(humanoid, ['WalkSpeed'], () => walkSpeed, (value) => {
    const next = Number(value);
    if (Number.isFinite(next) && next > 0) walkSpeed = next;
  });
  defineAlias(humanoid, ['Health'], () => deps.player.getHealth(), (value) => {
    deps.player.setHealth(Number(value) || 0);
  });
  defineAlias(humanoid, ['MaxHealth'], () => deps.player.getMaxHealth(), () => undefined);

  // `JumpPower` is the launch velocity in the unit a script uses; the controller works
  // in metres per second. 50 - the value a ported script expects - maps onto the 9 m/s
  // the controller shipped with, so an untouched value jumps exactly as it did.
  const JUMP_POWER_SCALE = 9 / 50;
  defineAlias(
    humanoid,
    ['JumpPower', 'jumpPower'],
    () => (deps.player.getJumpVelocity?.() ?? 9) / JUMP_POWER_SCALE,
    (value) => {
      const power = Number(value);
      if (Number.isFinite(power) && power > 0) deps.player.setJumpVelocity?.(power * JUMP_POWER_SCALE);
    }
  );
  // Write-only: a jump is a request, not a state this runtime can report back, so the
  // getter is false rather than a guess.
  defineAlias(humanoid, ['Jump', 'jump'], () => false, (value) => {
    if (value) deps.player.jump?.();
  });

  humanoid.MoveTo = (...raw: unknown[]) => {
    const args = afterSelf(raw);
    const first = args[0] as { x?: number; z?: number } | number | undefined;
    const isVector = typeof first === 'object' && first !== null;
    const x = Number(isVector ? first.x : first);
    const z = Number(isVector ? first.z : args[2] ?? args[1]);
    if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
    return deps.navigation?.moveTo(x, z, walkSpeed) ?? false;
  };
  humanoid.TakeDamage = (...raw: unknown[]) => {
    const [amount] = afterSelf(raw);
    deps.player.damage(Number(amount) || 0);
  };

  humanoid.Heal = (...raw: unknown[]) => {
    const [amount] = afterSelf(raw);
    deps.player.heal(Number(amount) || 0);
  };

  const character: Record<string, unknown> = { Humanoid: humanoid };
  defineAlias(character, ['Position'], () => deps.player.getPosition(), (value) => {
    const vec = toVec3(value);
    deps.player.setPosition(vec.x, vec.y, vec.z);
  });
  defineAlias(character, ['Name'], () => deps.player.name, () => undefined);
  defineAlias(api, ['Character'], () => character, () => undefined);

  // Ported scripts guard before touching a humanoid:
  //   local h = character:FindFirstChild("Humanoid")
  // The lookup has to answer, or the guard itself is what raises.
  const childOf = (name: unknown): unknown =>
    String(name ?? '').toLowerCase() === 'humanoid' ? humanoid : undefined;
  const afterCharacter = (args: unknown[]): unknown[] =>
    args[0] === character ? args.slice(1) : args;
  character.FindFirstChild = (...args: unknown[]) => childOf(afterCharacter(args)[0]);
  character.FindFirstChildOfClass = (...args: unknown[]) => childOf(afterCharacter(args)[0]);
  // The humanoid is created with the character, so waiting returns it immediately.
  character.WaitForChild = (...args: unknown[]) => childOf(afterCharacter(args)[0]);

  // Death and respawn. The health transition is polled once per frame rather than
  // pushed from the controller: damage arrives from hazards, other scripts and the
  // console alike, and a single latch cannot miss any of them.
  const died = createSignal('Died', deps.log);
  const characterAdded = createSignal('CharacterAdded', deps.log);
  humanoid.Died = died.signal;
  defineAlias(api, ['CharacterAdded'], () => characterAdded.signal, () => undefined);

  // A host may hand over a minimal player handle (a script harness, a headless
  // test). Reading health must not be what makes the whole context fail to start.
  const currentHealth = (): number => {
    try {
      const value = deps.player.getHealth();
      return typeof value === 'number' ? value : 1;
    } catch {
      return 1;
    }
  };

  let wasDead = currentHealth() <= 0;
  const pollSignals = (): void => {
    const dead = currentHealth() <= 0;
    if (dead && !wasDead) died.fire();
    if (!dead && wasDead) characterAdded.fire();
    wasDead = dead;
  };
  Object.defineProperty(api, 'pollSignals', { value: pollSignals, enumerable: false });

  return api;
}
