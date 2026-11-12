// E2E 3D Web Test Harness for Mochi Platform 3D Overhaul
// Provides 3D humanoid rig fixtures, camera-relative motion math, touch joystick helpers, and studio models

export type HumanoidPart = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type AvatarAnimationState = 'idle' | 'walk' | 'jump';

export interface HumanoidRigConfig {
  headColor: string;
  torsoColor: string;
  leftArmColor: string;
  rightArmColor: string;
  leftLegColor: string;
  rightLegColor: string;
  hatId?: string;
  shirtId?: string;
}

export interface HumanoidPartTransform {
  position: { x: number; y: number; z: number };
  rotation: { x: number; y: number; z: number };
}

export class ProceduralHumanoidRigHarness {
  public parts: Record<HumanoidPart, HumanoidPartTransform>;
  public colors: HumanoidRigConfig;
  public state: AvatarAnimationState = 'idle';

  constructor(config: HumanoidRigConfig) {
    this.colors = { ...config };
    this.parts = {
      head: { position: { x: 0, y: 2.2, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      torso: { position: { x: 0, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      leftArm: { position: { x: -0.9, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      rightArm: { position: { x: 0.9, y: 1.4, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      leftLeg: { position: { x: -0.4, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } },
      rightLeg: { position: { x: 0.4, y: 0.5, z: 0 }, rotation: { x: 0, y: 0, z: 0 } }
    };
  }

  public updatePartColor(part: HumanoidPart, hexColor: string): void {
    const key = `${part}Color` as keyof HumanoidRigConfig;
    if (key in this.colors) {
      (this.colors as Record<string, string>)[key] = hexColor;
    }
  }

  public stepAnimation(timeSeconds: number, state: AvatarAnimationState): void {
    this.state = state;
    if (state === 'walk') {
      const angle = Math.sin(timeSeconds * 8) * 0.6;
      this.parts.leftArm.rotation.x = -angle;
      this.parts.rightArm.rotation.x = angle;
      this.parts.leftLeg.rotation.x = angle;
      this.parts.rightLeg.rotation.x = -angle;
    } else if (state === 'jump') {
      this.parts.leftArm.rotation.x = -Math.PI * 0.7;
      this.parts.rightArm.rotation.x = -Math.PI * 0.7;
      this.parts.leftLeg.rotation.x = 0.3;
      this.parts.rightLeg.rotation.x = 0.3;
    } else {
      this.parts.leftArm.rotation.x = 0;
      this.parts.rightArm.rotation.x = 0;
      this.parts.leftLeg.rotation.x = 0;
      this.parts.rightLeg.rotation.x = 0;
    }
  }
}

export function computeCameraRelativeVelocity(
  input: { forward: number; strafe: number },
  cameraYawRadians: number,
  moveSpeed = 6.0
): { vx: number; vz: number; facingAngle: number } {
  const sinYaw = Math.sin(cameraYawRadians);
  const cosYaw = Math.cos(cameraYawRadians);

  const worldX = input.strafe * cosYaw + input.forward * sinYaw;
  const worldZ = -input.strafe * sinYaw + input.forward * cosYaw;

  const length = Math.hypot(worldX, worldZ);
  if (length === 0) {
    return { vx: 0, vz: 0, facingAngle: 0 };
  }

  const vx = (worldX / length) * moveSpeed;
  const vz = (worldZ / length) * moveSpeed;
  const facingAngle = Math.atan2(worldX, worldZ);

  return { vx, vz, facingAngle };
}

export class TouchJoystickHarness {
  public maxRadius: number;
  public deadzone: number;
  public currentVector: { x: number; y: number } = { x: 0, y: 0 };
  public isActive = false;

  constructor(maxRadius = 60, deadzone = 0.1) {
    this.maxRadius = maxRadius;
    this.deadzone = deadzone;
  }

  public handleTouchStart(): void {
    this.isActive = true;
    this.currentVector = { x: 0, y: 0 };
  }

  public handleTouchMove(deltaX: number, deltaY: number): { x: number; y: number } {
    if (!this.isActive) return { x: 0, y: 0 };

    const distance = Math.hypot(deltaX, deltaY);
    if (distance === 0 || this.maxRadius <= 0) {
      this.currentVector = { x: 0, y: 0 };
      return this.currentVector;
    }

    const clampedDist = Math.min(distance, this.maxRadius);
    const normalizedDist = clampedDist / this.maxRadius;

    if (normalizedDist < this.deadzone) {
      this.currentVector = { x: 0, y: 0 };
    } else {
      this.currentVector = {
        x: (deltaX / distance) * normalizedDist,
        y: -(deltaY / distance) * normalizedDist
      };
    }
    return this.currentVector;
  }

  public handleTouchEnd(): void {
    this.isActive = false;
    this.currentVector = { x: 0, y: 0 };
  }
}

export class DecoupledPhysicsTickerHarness {
  public fixedTimeStep = 1 / 60;
  public accumulator = 0;
  public totalTicks = 0;
  public simulatedTime = 0;

  public advanceFrame(deltaSeconds: number, tickCallback: (dt: number) => void): number {
    const clampedDelta = Math.min(deltaSeconds, 0.25);
    this.accumulator += clampedDelta;

    let executedTicks = 0;
    while (this.accumulator >= this.fixedTimeStep) {
      tickCallback(this.fixedTimeStep);
      this.accumulator -= this.fixedTimeStep;
      this.totalTicks++;
      this.simulatedTime += this.fixedTimeStep;
      executedTicks++;
    }
    return executedTicks;
  }
}

export function computeGameCard3DTilt(
  clientX: number,
  clientY: number,
  cardRect: { left: number; top: number; width: number; height: number },
  maxTiltDegrees = 14
): { rotateX: number; rotateY: number; specularX: number; specularY: number } {
  if (cardRect.width <= 0 || cardRect.height <= 0) {
    return { rotateX: 0, rotateY: 0, specularX: 50, specularY: 50 };
  }

  const offsetX = clientX - cardRect.left;
  const offsetY = clientY - cardRect.top;

  const normX = Math.max(-1, Math.min(1, (offsetX / cardRect.width) * 2 - 1));
  const normY = Math.max(-1, Math.min(1, (offsetY / cardRect.height) * 2 - 1));

  const rotateY = normX * maxTiltDegrees;
  const rotateX = -normY * maxTiltDegrees;

  const specularX = Math.max(0, Math.min(100, (offsetX / cardRect.width) * 100));
  const specularY = Math.max(0, Math.min(100, (offsetY / cardRect.height) * 100));

  return { rotateX, rotateY, specularX, specularY };
}

export function snapValueToGrid(val: number, step: number): number {
  if (step <= 0) return val;
  return Math.round(val / step) * step;
}

export interface TurntableAvatarState {
  rotationY: number;
  isDragging: boolean;
  autoSpinSpeed: number;
}

export class AvatarTurntableHarness {
  public state: TurntableAvatarState = {
    rotationY: 0,
    isDragging: false,
    autoSpinSpeed: 0.5
  };

  public onPointerDown(): void {
    this.state.isDragging = true;
  }

  public onPointerMove(deltaX: number): void {
    if (this.state.isDragging) {
      this.state.rotationY += deltaX * 0.01;
    }
  }

  public onPointerUp(): void {
    this.state.isDragging = false;
  }

  public updateIdle(deltaTime: number): void {
    if (!this.state.isDragging) {
      this.state.rotationY += this.state.autoSpinSpeed * deltaTime;
    }
  }
}
