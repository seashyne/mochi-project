// Tier 1 Web 3D Player & Engine Test Suite
// Verifies Feature 5 (3D Humanoid Rig), Feature 6 (Character Controller), Feature 7 (Touch Joystick), Feature 8 (Scene Loading)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProceduralHumanoidRigHarness,
  computeCameraRelativeVelocity,
  TouchJoystickHarness,
  DecoupledPhysicsTickerHarness
} from './e2e_3d_web_harness';

describe('Tier 1 Web E2E: Features 5-8 3D Engine & Controls (Happy Path)', () => {
  const starterConfig = {
    headColor: '#fcd34d',
    torsoColor: '#0284c7',
    leftArmColor: '#fcd34d',
    rightArmColor: '#fcd34d',
    leftLegColor: '#1e293b',
    rightLegColor: '#1e293b'
  };

  // Feature 5: Three.js Procedural 3D Avatar Humanoid Rig
  describe('F5: Procedural 3D Avatar Humanoid Rig & Anatomy', () => {
    let rig: ProceduralHumanoidRigHarness;

    beforeEach(() => {
      rig = new ProceduralHumanoidRigHarness(starterConfig);
    });

    it('T1_F5_01: Humanoid rig constructs all 6 core anatomical segments', () => {
      const parts = Object.keys(rig.parts);
      expect(parts).toContain('head');
      expect(parts).toContain('torso');
      expect(parts).toContain('leftArm');
      expect(parts).toContain('rightArm');
      expect(parts).toContain('leftLeg');
      expect(parts).toContain('rightLeg');
    });

    it('T1_F5_02: Parts possess expected relative height offsets in rest position', () => {
      expect(rig.parts.head.position.y).toBeGreaterThan(rig.parts.torso.position.y);
      expect(rig.parts.torso.position.y).toBeGreaterThan(rig.parts.leftLeg.position.y);
      expect(rig.parts.leftArm.position.x).toBeLessThan(0);
      expect(rig.parts.rightArm.position.x).toBeGreaterThan(0);
    });

    it('T1_F5_03: Supports dynamic color updates on individual anatomical parts', () => {
      rig.updatePartColor('torso', '#ff00aa');
      rig.updatePartColor('head', '#ffe0bd');
      expect(rig.colors.torsoColor).toBe('#ff00aa');
      expect(rig.colors.headColor).toBe('#ffe0bd');
    });

    it('T1_F5_04: Walk animation cycle generates opposing sinusoidal arm and leg rotations', () => {
      rig.stepAnimation(0.25, 'walk');
      expect(rig.state).toBe('walk');
      expect(Math.sign(rig.parts.leftArm.rotation.x)).toBe(-Math.sign(rig.parts.rightArm.rotation.x));
      expect(Math.sign(rig.parts.leftLeg.rotation.x)).toBe(-Math.sign(rig.parts.rightLeg.rotation.x));
    });

    it('T1_F5_05: Jump animation lifts arms upward and angles legs forward', () => {
      rig.stepAnimation(0, 'jump');
      expect(rig.state).toBe('jump');
      expect(rig.parts.leftArm.rotation.x).toBeLessThan(-1.0);
      expect(rig.parts.rightArm.rotation.x).toBeLessThan(-1.0);
      expect(rig.parts.leftLeg.rotation.x).toBeGreaterThan(0);
    });
  });

  // Feature 6: Camera-Relative 3D Character Controller
  describe('F6: Camera-Relative 3D Character Controller', () => {
    it('T1_F6_01: Forward input at zero camera yaw moves character straight along Z axis', () => {
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, 0, 6.0);
      expect(vx).toBeCloseTo(0);
      expect(vz).toBeCloseTo(6.0);
    });

    it('T1_F6_02: Forward input with 90 degree camera yaw moves character along positive X axis', () => {
      const yaw90 = Math.PI / 2;
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, yaw90, 6.0);
      expect(vx).toBeCloseTo(6.0);
      expect(vz).toBeCloseTo(0);
    });

    it('T1_F6_03: Strafe right with zero camera yaw moves character along positive X axis', () => {
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 0, strafe: 1 }, 0, 6.0);
      expect(vx).toBeCloseTo(6.0);
      expect(vz).toBeCloseTo(0);
    });

    it('T1_F6_04: Diagonal input normalizes velocity vector without exceeding max move speed', () => {
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 1 }, 0, 6.0);
      const totalSpeed = Math.hypot(vx, vz);
      expect(totalSpeed).toBeCloseTo(6.0);
    });

    it('T1_F6_05: Zero input produces zero velocity and default facing angle', () => {
      const { vx, vz, facingAngle } = computeCameraRelativeVelocity({ forward: 0, strafe: 0 }, 0, 6.0);
      expect(vx).toBe(0);
      expect(vz).toBe(0);
      expect(facingAngle).toBe(0);
    });
  });

  // Feature 7: Multi-Device Touch Controls & Virtual Joystick
  describe('F7: Multi-Device Touch Controls & Virtual Joystick', () => {
    let joystick: TouchJoystickHarness;

    beforeEach(() => {
      joystick = new TouchJoystickHarness(60, 0.1);
    });

    it('T1_F7_01: Touch start activates joystick and resets vector', () => {
      joystick.handleTouchStart();
      expect(joystick.isActive).toBe(true);
      expect(joystick.currentVector).toEqual({ x: 0, y: 0 });
    });

    it('T1_F7_02: Touch drag within bounds returns normalized directional coordinates', () => {
      joystick.handleTouchStart();
      const vec = joystick.handleTouchMove(30, 0);
      expect(vec.x).toBeCloseTo(0.5);
      expect(vec.y).toBeCloseTo(0);
    });

    it('T1_F7_03: Touch drag beyond max radius clamps vector magnitude to 1.0', () => {
      joystick.handleTouchStart();
      const vec = joystick.handleTouchMove(120, 0);
      expect(vec.x).toBeCloseTo(1.0);
      expect(vec.y).toBeCloseTo(0);
    });

    it('T1_F7_04: Small jitter within deadzone threshold outputs zero vector', () => {
      joystick.handleTouchStart();
      const vec = joystick.handleTouchMove(3, 3);
      expect(vec.x).toBe(0);
      expect(vec.y).toBe(0);
    });

    it('T1_F7_05: Touch end deactivates joystick and clears output vector', () => {
      joystick.handleTouchStart();
      joystick.handleTouchMove(40, -40);
      joystick.handleTouchEnd();
      expect(joystick.isActive).toBe(false);
      expect(joystick.currentVector).toEqual({ x: 0, y: 0 });
    });
  });

  // Feature 8: Dynamic 3D Scene Loading & Telemetry Optimization
  describe('F8: Dynamic Scene Loading & Telemetry Optimization', () => {
    let ticker: DecoupledPhysicsTickerHarness;

    beforeEach(() => {
      ticker = new DecoupledPhysicsTickerHarness();
    });

    it('T1_F8_01: Fixed 60Hz physics ticker steps at 16.67ms intervals', () => {
      expect(ticker.fixedTimeStep).toBeCloseTo(1 / 60);
    });

    it('T1_F8_02: 33.33ms elapsed delta advances exactly 2 physics steps', () => {
      let ticksRan = 0;
      const count = ticker.advanceFrame(0.03334, () => {
        ticksRan++;
      });
      expect(count).toBe(2);
      expect(ticksRan).toBe(2);
      expect(ticker.totalTicks).toBe(2);
    });

    it('T1_F8_03: Small 5ms frame sub-step accumulates remainder without premature tick', () => {
      let ticksRan = 0;
      const count = ticker.advanceFrame(0.005, () => {
        ticksRan++;
      });
      expect(count).toBe(0);
      expect(ticksRan).toBe(0);
      expect(ticker.accumulator).toBeCloseTo(0.005);
    });

    it('T1_F8_04: Large frame hitch delta is clamped to prevent spiral of death', () => {
      let ticksRan = 0;
      // 1.0 second freeze
      const count = ticker.advanceFrame(1.0, () => {
        ticksRan++;
      });
      // Clamped to 0.25s / (1/60) = 15 ticks maximum
      expect(count).toBeLessThanOrEqual(16);
      expect(ticksRan).toBeLessThanOrEqual(16);
    });

    it('T1_F8_05: Total simulated time matches exact fixed timestep count', () => {
      ticker.advanceFrame(0.05, () => {});
      expect(ticker.simulatedTime).toBeCloseTo(ticker.totalTicks * (1 / 60));
    });
  });
});
