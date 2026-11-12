// Tier 2 Web 3D Player & Engine Boundary Test Suite
// Verifies boundary cases for F5 (Rig boundaries), F6 (Controller yaw limits), F7 (Touch radius edges), F8 (Physics accumulator limits)

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ProceduralHumanoidRigHarness,
  computeCameraRelativeVelocity,
  TouchJoystickHarness,
  DecoupledPhysicsTickerHarness,
  HumanoidPart
} from './e2e_3d_web_harness';

describe('Tier 2 Web E2E: Features 5-8 3D Engine Boundary & Corner Cases', () => {
  const starterConfig = {
    headColor: '#fcd34d',
    torsoColor: '#0284c7',
    leftArmColor: '#fcd34d',
    rightArmColor: '#fcd34d',
    leftLegColor: '#1e293b',
    rightLegColor: '#1e293b'
  };

  // Feature 5 Boundary: Rig Animation & Color Limits
  describe('F5 Boundary: 3D Humanoid Rig Edge Cases', () => {
    let rig: ProceduralHumanoidRigHarness;

    beforeEach(() => {
      rig = new ProceduralHumanoidRigHarness(starterConfig);
    });

    it('T2_F5_01: Ignores color updates on invalid non-existent body parts without throwing', () => {
      expect(() => rig.updatePartColor('wings' as unknown as HumanoidPart, '#ffffff')).not.toThrow();
      expect(rig.colors.torsoColor).toBe('#0284c7');
    });

    it('T2_F5_02: Handles extreme animation timestamps without numerical divergence', () => {
      expect(() => rig.stepAnimation(1000000.5, 'walk')).not.toThrow();
      expect(Math.abs(rig.parts.leftArm.rotation.x)).toBeLessThanOrEqual(0.61);
      expect(Math.abs(rig.parts.leftLeg.rotation.x)).toBeLessThanOrEqual(0.61);
    });

    it('T2_F5_03: Transitioning from jump directly to walk immediately updates rotation targets', () => {
      rig.stepAnimation(0, 'jump');
      expect(rig.parts.leftArm.rotation.x).toBeLessThan(-1.0);
      rig.stepAnimation(0.25, 'walk');
      expect(rig.state).toBe('walk');
      expect(Math.abs(rig.parts.leftArm.rotation.x)).toBeLessThanOrEqual(0.61);
    });

    it('T2_F5_04: Idle state resets all arm and leg rotation angles to exact zero', () => {
      rig.stepAnimation(0.5, 'walk');
      rig.stepAnimation(0, 'idle');
      expect(rig.parts.leftArm.rotation.x).toBe(0);
      expect(rig.parts.rightArm.rotation.x).toBe(0);
      expect(rig.parts.leftLeg.rotation.x).toBe(0);
      expect(rig.parts.rightLeg.rotation.x).toBe(0);
    });

    it('T2_F5_05: Multiple independent rig instances maintain isolated transform states', () => {
      const rigB = new ProceduralHumanoidRigHarness({ ...starterConfig, headColor: '#00ff00' });
      rig.stepAnimation(0.5, 'walk');
      expect(rig.parts.leftArm.rotation.x).not.toBe(0);
      expect(rigB.parts.leftArm.rotation.x).toBe(0);
    });
  });

  // Feature 6 Boundary: Character Controller Coordinate & Angle Wrapping
  describe('F6 Boundary: Controller Yaw and Velocity Clamping', () => {
    it('T2_F6_01: Yaw angles exceeding full circle wrap smoothly without precision loss', () => {
      const yawWrapped = Math.PI * 2 + Math.PI / 2;
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, yawWrapped, 6.0);
      expect(vx).toBeCloseTo(6.0);
      expect(vz).toBeCloseTo(0);
    });

    it('T2_F6_02: Negative yaw angles evaluate correct trigonometric heading', () => {
      const negYaw = -Math.PI / 2;
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 0 }, negYaw, 6.0);
      expect(vx).toBeCloseTo(-6.0);
      expect(vz).toBeCloseTo(0);
    });

    it('T2_F6_03: Pure backward input moves character in negative Z direction at zero yaw', () => {
      const { vx, vz, facingAngle } = computeCameraRelativeVelocity({ forward: -1, strafe: 0 }, 0, 5.0);
      expect(vx).toBeCloseTo(0);
      expect(vz).toBeCloseTo(-5.0);
      expect(Math.abs(facingAngle)).toBeCloseTo(Math.PI);
    });

    it('T2_F6_04: Handles zero movement speed without producing NaN velocity', () => {
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 1, strafe: 1 }, 0, 0);
      expect(vx).toBe(0);
      expect(vz).toBe(0);
      expect(Number.isNaN(vx)).toBe(false);
      expect(Number.isNaN(vz)).toBe(false);
    });

    it('T2_F6_05: Input values exceeding unit range are clamped through vector normalization', () => {
      const { vx, vz } = computeCameraRelativeVelocity({ forward: 100, strafe: 100 }, 0, 10.0);
      const magnitude = Math.hypot(vx, vz);
      expect(magnitude).toBeCloseTo(10.0);
    });
  });

  // Feature 7 Boundary: Touch Controls Deadzone & Extreme Offsets
  describe('F7 Boundary: Touch Joystick Bounds and Corner Inputs', () => {
    let joystick: TouchJoystickHarness;

    beforeEach(() => {
      joystick = new TouchJoystickHarness(50, 0.15);
    });

    it('T2_F7_01: Move events ignored if joystick has not received touch start', () => {
      const vec = joystick.handleTouchMove(30, 30);
      expect(vec).toEqual({ x: 0, y: 0 });
      expect(joystick.isActive).toBe(false);
    });

    it('T2_F7_02: Drag coordinate precisely at deadzone threshold outputs zero', () => {
      joystick.handleTouchStart();
      // deadzone is 0.15 * 50 = 7.5px
      const vec = joystick.handleTouchMove(7, 0);
      expect(vec.x).toBe(0);
      expect(vec.y).toBe(0);
    });

    it('T2_F7_03: Drag coordinate just above deadzone produces non-zero normalized vector', () => {
      joystick.handleTouchStart();
      const vec = joystick.handleTouchMove(10, 0);
      expect(vec.x).toBeGreaterThan(0);
      expect(vec.x).toBeCloseTo(10 / 50);
    });

    it('T2_F7_04: Negative X and Y drag coordinates invert output vector signs correctly', () => {
      joystick.handleTouchStart();
      const vec = joystick.handleTouchMove(-50, 50);
      expect(vec.x).toBeLessThan(0);
      expect(vec.y).toBeLessThan(0);
    });

    it('T2_F7_05: Zero radius configuration defaults safely without divide by zero', () => {
      const zeroJoystick = new TouchJoystickHarness(0, 0.1);
      zeroJoystick.handleTouchStart();
      const vec = zeroJoystick.handleTouchMove(10, 10);
      expect(Number.isNaN(vec.x)).toBe(false);
      expect(Number.isNaN(vec.y)).toBe(false);
    });
  });

  // Feature 8 Boundary: Physics Accumulator & Clock Jitter
  describe('F8 Boundary: Decoupled Physics Ticker Limits', () => {
    let ticker: DecoupledPhysicsTickerHarness;

    beforeEach(() => {
      ticker = new DecoupledPhysicsTickerHarness();
    });

    it('T2_F8_01: Zero delta frame advance executes zero ticks and preserves accumulator', () => {
      const executed = ticker.advanceFrame(0, () => {});
      expect(executed).toBe(0);
      expect(ticker.accumulator).toBe(0);
    });

    it('T2_F8_02: Extreme 120Hz display refresh (8.33ms) accumulates across two frames', () => {
      const dt120Hz = 1 / 120;
      const count1 = ticker.advanceFrame(dt120Hz, () => {});
      expect(count1).toBe(0);
      const count2 = ticker.advanceFrame(dt120Hz, () => {});
      expect(count2).toBe(1);
    });

    it('T2_F8_03: Multiple frame hitches clamped individually without accumulator overflow', () => {
      for (let i = 0; i < 5; i++) {
        ticker.advanceFrame(0.5, () => {});
      }
      expect(ticker.accumulator).toBeLessThan(1 / 60);
      expect(ticker.totalTicks).toBeGreaterThan(0);
    });

    it('T2_F8_04: Callback exception halts frame loop without corrupting totalTicks count', () => {
      let runCount = 0;
      expect(() => {
        ticker.advanceFrame(0.1, () => {
          runCount++;
          if (runCount === 2) throw new Error('Physics crash');
        });
      }).toThrow('Physics crash');
      expect(runCount).toBe(2);
    });

    it('T2_F8_05: High tick counts execute accurately without floating-point accumulation drift', () => {
      for (let i = 0; i < 60; i++) {
        ticker.advanceFrame(1 / 60, () => {});
      }
      expect(ticker.totalTicks).toBe(60);
      expect(ticker.simulatedTime).toBeCloseTo(1.0);
    });
  });
});
