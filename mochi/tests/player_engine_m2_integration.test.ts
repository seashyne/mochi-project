// Integration Test: Milestone 2 3D Player Engine, Controls & Lifecycle Integration
// Tests complete loop: Scene Load -> Spawn -> Grounding -> Jump -> Touchdown -> Idle -> Cleanup

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { PhysicsWorld, RigidBody, CharacterPhysicsController } from '../src/engine/physics';
import { FollowCamera } from '../src/engine/camera/followCamera';
import { buildHumanoidAvatar, DEFAULT_AVATAR_COLORS } from '../src/engine/avatar/avatarBuilder';
import { loadWorldFromManifest } from '../src/engine/scene/sceneLoader';

describe('Milestone 2 Player Engine End-to-End Integration Loop', () => {
  it('executes full lifecycle across sceneLoader, physics, camera, and avatar rig', () => {
    const scene = new THREE.Scene();
    const physicsWorld = new PhysicsWorld();

    // 1. Load world with mixed valid and partial objects
    const manifest = {
      objects: [
        { id: 'sp1', type: 'spawn', position: { x: 0, y: 0, z: 0 }, scale: { x: 4, y: 0.2, z: 4 } },
        { id: 'p1', type: 'platform', position: { x: 0, y: 0, z: 5 }, scale: { x: 4, y: 0.5, z: 4 } },
        { id: 'partial_obj', type: 'block' }
      ]
    };

    const worldResult = loadWorldFromManifest(scene, manifest, physicsWorld);
    expect(worldResult.success).toBe(true);
    expect(worldResult.meshes.length).toBe(2);
    const boxes = worldResult.meshes.find(
      (mesh) => mesh.name === 'instances_box'
    ) as THREE.InstancedMesh;
    expect(boxes.count).toBe(2);
    expect(worldResult.bodies.length).toBe(3);

    // 2. Initialize Player RigidBody and Character Controller
    const playerBody = new RigidBody({
      id: 'local_player',
      type: 'dynamic',
      position: { x: 0, y: 1.0, z: 0 },
      shape: { type: 'sphere', radius: 0.6 }
    });
    physicsWorld.addBody(playerBody);

    const controller = new CharacterPhysicsController(playerBody, physicsWorld);
    controller.setSpawnPoint(worldResult.spawnPoint);
    controller.respawn();

    const camera = new FollowCamera({ target: playerBody.position });
    camera.setTarget(worldResult.spawnPoint);
    camera.teleportToTarget();

    const avatar = buildHumanoidAvatar(DEFAULT_AVATAR_COLORS);
    scene.add(avatar.root);

    // 3. Step physics simulation: player settles onto spawn platform
    for (let i = 0; i < 20; i++) {
      physicsWorld.step(0.016);
      controller.update({ x: 0, y: 0 }, false, false, 0.016, camera.getYaw());
    }
    expect(controller.getGrounded()).toBe(true);

    // 4. Trigger jump action: verify jump pose entered
    controller.update({ x: 0, y: 0 }, true, false, 0.016, camera.getYaw());
    expect(playerBody.velocity.y).toBeGreaterThan(5.0);
    expect(controller.getGrounded()).toBe(false);

    avatar.setJumpPose(true);
    expect(avatar.state).toBe('jump');
    expect(avatar.parts.leftArm.rotation.x).toBeCloseTo(-Math.PI * 0.7, 4);

    // 5. Step physics until character falls and lands
    for (let i = 0; i < 80; i++) {
      physicsWorld.step(0.016);
      controller.update({ x: 0, y: 0 }, false, false, 0.016, camera.getYaw());
      if (controller.getGrounded()) break;
    }
    expect(controller.getGrounded()).toBe(true);

    // 6. Stationary landing: avatar must cleanly reset to idle
    avatar.stepWalkCycle(0, 0.016);
    expect(avatar.state).toBe('idle');
    expect(avatar.parts.leftArm.rotation.x).toBe(0);
    expect(avatar.parts.leftLeg.rotation.x).toBe(0);

    // 7. Verify camera target matches player coordinates without NaN
    camera.setTarget(controller.getPosition());
    expect(Number.isFinite(camera.target.x)).toBe(true);
    expect(Number.isFinite(camera.target.y)).toBe(true);
    expect(Number.isFinite(camera.target.z)).toBe(true);

    // 8. Clean disposal
    worldResult.dispose();
    scene.remove(avatar.root);
    avatar.dispose();
    physicsWorld.removeBody(playerBody.id);
    expect(scene.children.length).toBe(0);
    expect(physicsWorld.getAllBodies().length).toBe(0);
  });
});
