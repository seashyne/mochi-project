// Playable character for a session: physics body, WASD/space input, and the
// RuntimePlayerHandle surface that Lua scripts are allowed to drive.

import * as THREE from 'three';
import { CharacterPhysicsController, PhysicsWorld, RigidBody } from '../physics';
import { RuntimePlayerHandle, RuntimeVec3 } from './types';

export const PLAYER_BODY_ID = 'playtest_player';

export class PlaytestPlayer implements RuntimePlayerHandle {
  readonly id = PLAYER_BODY_ID;
  readonly name: string;
  readonly body: RigidBody;
  readonly controller: CharacterPhysicsController;
  readonly mesh: THREE.Group;

  private readonly keys = new Set<string>();
  private readonly maxHealth = 100;
  private health = 100;
  private jumpQueued = false;
  private spawn: RuntimeVec3;

  constructor(physics: PhysicsWorld, scene: THREE.Scene, spawn: RuntimeVec3, name = 'Creator') {
    this.name = name;
    this.spawn = { ...spawn };
    this.body = new RigidBody({
      id: PLAYER_BODY_ID,
      type: 'dynamic',
      position: { x: spawn.x, y: spawn.y + 1, z: spawn.z },
      shape: { type: 'sphere', radius: 0.5 },
      material: { friction: 0.35, restitution: 0 }
    });
    physics.addBody(this.body);
    this.controller = new CharacterPhysicsController(this.body, physics);
    this.controller.setSpawnPoint({ x: spawn.x, y: spawn.y + 1, z: spawn.z });

    this.mesh = new THREE.Group();
    const bodyMesh = new THREE.Mesh(
      new THREE.SphereGeometry(0.5, 22, 18),
      new THREE.MeshStandardMaterial({ color: 0x38bdf8, emissive: 0x0284c7, emissiveIntensity: 0.45, roughness: 0.25, metalness: 0.55 })
    );
    this.mesh.add(bodyMesh);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.42, 0.16, 0.14),
      new THREE.MeshStandardMaterial({ color: 0xe0f2fe, emissive: 0x7dd3fc, emissiveIntensity: 0.9 })
    );
    visor.position.set(0, 0.12, 0.44);
    this.mesh.add(visor);
    this.mesh.position.set(spawn.x, spawn.y + 1, spawn.z);
    scene.add(this.mesh);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.handleKeyDown);
      window.addEventListener('keyup', this.handleKeyUp);
    }
  }

  getPosition(): RuntimeVec3 {
    return this.controller.getPosition();
  }

  setPosition(x: number, y: number, z: number): void {
    this.body.setPosition(x, y, z);
    this.body.setVelocity(0, 0, 0);
    this.body.updateAABB();
    this.mesh.position.set(x, y, z);
  }

  setVelocity(x: number, y: number, z: number): void {
    this.body.setVelocity(x, y, z);
  }

  applyImpulse(x: number, y: number, z: number): void {
    this.body.applyImpulse({ x, y, z });
  }

  respawn(): void {
    this.controller.respawn();
    this.health = this.maxHealth;
  }

  damage(amount: number): void {
    this.health = Math.max(0, this.health - Math.abs(Number(amount) || 0));
    if (this.health <= 0) this.respawn();
  }

  heal(amount: number): void {
    this.health = Math.min(this.maxHealth, this.health + Math.abs(Number(amount) || 0));
  }

  getHealth(): number {
    return this.health;
  }

  setHealth(value: number): void {
    this.health = Math.max(0, Math.min(this.maxHealth, Number(value) || 0));
  }

  getMaxHealth(): number {
    return this.maxHealth;
  }

  setSpawnPoint(position: RuntimeVec3): void {
    this.spawn = { ...position };
    this.controller.setSpawnPoint({ x: position.x, y: position.y + 1, z: position.z });
  }

  getSpawnPoint(): RuntimeVec3 {
    return { ...this.spawn };
  }

  getJumpVelocity(): number {
    return this.controller.getJumpVelocity();
  }

  setJumpVelocity(value: number): void {
    this.controller.setJumpVelocity(value);
  }

  jump(): void {
    // The same queue the space bar fills, so a scripted jump gets the same buffering
    // and coyote time as a pressed one.
    this.jumpQueued = true;
  }

  update(dt: number, cameraYaw: number): void {
    const forward =
      (this.keys.has('w') || this.keys.has('arrowup') ? 1 : 0) -
      (this.keys.has('s') || this.keys.has('arrowdown') ? 1 : 0);
    const strafe =
      (this.keys.has('d') || this.keys.has('arrowright') ? 1 : 0) -
      (this.keys.has('a') || this.keys.has('arrowleft') ? 1 : 0);

    this.controller.update({ x: strafe, y: forward }, this.jumpQueued, this.keys.has('shift'), dt, cameraYaw);
    this.jumpQueued = false;

    const p = this.controller.getPosition();
    this.mesh.position.set(p.x, p.y, p.z);
    this.mesh.rotation.y = this.controller.getFacingAngle();
  }

  dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.handleKeyDown);
      window.removeEventListener('keyup', this.handleKeyUp);
    }
    this.keys.clear();
    this.mesh.removeFromParent();
    this.mesh.traverse((child) => {
      const mesh = child as THREE.Mesh;
      mesh.geometry?.dispose?.();
      const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(material)) material.forEach((mat) => mat.dispose());
      else material?.dispose?.();
    });
  }

  private handleKeyDown = (event: KeyboardEvent): void => {
    const target = event.target as HTMLElement | null;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === ' ' || key.startsWith('arrow')) event.preventDefault();
    if (key === ' ' && !this.keys.has(' ')) this.jumpQueued = true;
    this.keys.add(key);
  };

  private handleKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.key.toLowerCase());
  };
}
