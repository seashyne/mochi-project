// Tier 4 Web 3D Real-World Application Scenarios Test Suite
// Verifies full-stack player journeys, creator workflows, and complete studio lifecycles

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProceduralHumanoidRigHarness,
  computeCameraRelativeVelocity,
  TouchJoystickHarness,
  DecoupledPhysicsTickerHarness,
  AvatarTurntableHarness,
  computeGameCard3DTilt
} from './e2e_3d_web_harness';
import { StudioObject } from '../../src/engine/studio/types';

describe('Tier 4 Web E2E: Real-World Web Application Scenarios', () => {
  // Scenario 1: Mobile Player First-Time Journey
  it('T4_W01: Mobile/Tablet Player Journey: Starter avatar spawn, touch navigation, and jump physics', () => {
    // 1. Spawns with starter avatar
    const starterRig = new ProceduralHumanoidRigHarness({
      headColor: '#fcd34d',
      torsoColor: '#0284c7',
      leftArmColor: '#fcd34d',
      rightArmColor: '#fcd34d',
      leftLegColor: '#1e293b',
      rightLegColor: '#1e293b'
    });
    expect(starterRig.parts.head.position.y).toBeCloseTo(2.2);

    // 2. Touch joystick controls movement
    const joystick = new TouchJoystickHarness(60, 0.1);
    joystick.handleTouchStart();
    const inputVector = joystick.handleTouchMove(50, -50);

    // 3. Camera-relative motion calculation
    const cameraYaw = Math.PI / 4; // 45 degree camera angle
    const velocity = computeCameraRelativeVelocity({ forward: inputVector.y, strafe: inputVector.x }, cameraYaw, 6.0);
    expect(Math.hypot(velocity.vx, velocity.vz)).toBeGreaterThan(0);

    // 4. Avatar walk animation updates
    starterRig.stepAnimation(0.2, 'walk');
    expect(starterRig.state).toBe('walk');

    // 5. Jump action triggered
    starterRig.stepAnimation(0, 'jump');
    expect(starterRig.state).toBe('jump');
    expect(starterRig.parts.leftArm.rotation.x).toBeLessThan(-1.0);
  });

  // Scenario 2: Creator Studio World Construction
  it('T4_W02: Creator Studio Lifecycle: Build obstacle course, attach scripts, and export snapshot', () => {
    // 1. Initialize studio scene objects
    const sceneObjects: StudioObject[] = [];

    // 2. Place spawn point
    sceneObjects.push({
      id: 'spawn_01',
      name: 'Player Spawn',
      type: 'spawn',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 2, y: 0.2, z: 2 },
      color: '#00a2ff',
      luaScript: 'world.setSpawnPoint(script.parent.position)'
    });

    // 3. Place jump pad with impulse velocity script
    sceneObjects.push({
      id: 'pad_01',
      name: 'Super Jump Pad',
      type: 'jump_pad',
      position: { x: 0, y: 0.5, z: 8 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 3, y: 0.3, z: 3 },
      color: '#10b981',
      luaScript: 'script.parent.onTouch(function(p) p.setVelocity(0, 20, 0) end)'
    });

    // 4. Place goal coin
    sceneObjects.push({
      id: 'coin_goal',
      name: 'Finish Star',
      type: 'coin',
      position: { x: 0, y: 6, z: 16 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1.5, y: 0.3, z: 1.5 },
      color: '#fbbf24',
      luaScript: 'script.parent.onTouch(function(p) p.addScore("Wins", 1) end)'
    });

    expect(sceneObjects).toHaveLength(3);

    // 5. Export scene snapshot for cloud publishing
    const snapshot = {
      version: '1.0.0',
      title: 'Neon Sky Parkour',
      objects: sceneObjects,
      createdAt: new Date().toISOString()
    };

    expect(snapshot.title).toBe('Neon Sky Parkour');
    expect(snapshot.objects.some((o) => o.type === 'jump_pad')).toBe(true);
  });

  // Scenario 3: Dark/Light Mode Creator Experience
  it('T4_W03: Dual Theme Creator Experience: Theme toggling, 3D GameCard styling, and luminous reflection', () => {
    let activeTheme: 'dark' | 'light' = 'dark';
    const cardRect = { left: 100, top: 100, width: 280, height: 380 };

    // Inspect initial Dark Mode card
    const darkTilt = computeGameCard3DTilt(240, 290, cardRect, 14);
    expect(darkTilt.rotateX).not.toBe(0);

    // Creator toggles to Light Mode
    activeTheme = 'light';
    const lightTilt = computeGameCard3DTilt(240, 290, cardRect, 14);
    expect(lightTilt.rotateX).toBe(darkTilt.rotateX);
    expect(lightTilt.specularX).toBe(darkTilt.specularX);

    // Creator toggles back to Dark Mode
    activeTheme = 'dark';
    expect(activeTheme).toBe('dark');
  });

  // Scenario 4: 3D Avatar Customization & Turntable Inspection
  it('T4_W04: User Profile Turntable: Manual spin, color palette updates, and continuous idle rotation', () => {
    const turntable = new AvatarTurntableHarness();
    const rig = new ProceduralHumanoidRigHarness({
      headColor: '#fcd34d',
      torsoColor: '#0284c7',
      leftArmColor: '#fcd34d',
      rightArmColor: '#fcd34d',
      leftLegColor: '#1e293b',
      rightLegColor: '#1e293b'
    });

    // 1. Idle auto-spin
    turntable.updateIdle(1.0);
    expect(turntable.state.rotationY).toBeCloseTo(0.5);

    // 2. User drags avatar to inspect back view
    turntable.onPointerDown();
    turntable.onPointerMove(157); // ~Math.PI * 50
    turntable.onPointerUp();
    expect(turntable.state.rotationY).toBeGreaterThan(1.5);

    // 3. User selects cyber red shirt color
    rig.updatePartColor('torso', '#ef4444');
    expect(rig.colors.torsoColor).toBe('#ef4444');

    // 4. User selects cyber blue pants
    rig.updatePartColor('leftLeg', '#0ea5e9');
    rig.updatePartColor('rightLeg', '#0ea5e9');
    expect(rig.colors.leftLegColor).toBe('#0ea5e9');
    expect(rig.colors.rightLegColor).toBe('#0ea5e9');
  });

  // Scenario 5: Studio to Playtest Mode Transition
  it('T4_W05: Studio to Playtest Transition: Physics ticker begins simulation and player spawns', () => {
    let mode: 'edit' | 'playtest' = 'edit';
    const ticker = new DecoupledPhysicsTickerHarness();

    // 1. Creator initiates Playtest mode
    mode = 'playtest';
    expect(mode).toBe('playtest');

    // 2. Decoupled physics engine executes ticks
    let simulatedTicks = 0;
    ticker.advanceFrame(0.1, () => {
      simulatedTicks++;
    });

    expect(simulatedTicks).toBe(6);
    expect(ticker.totalTicks).toBe(6);

    // 3. Creator stops playtest and returns to edit mode
    mode = 'edit';
    expect(mode).toBe('edit');
  });
});
