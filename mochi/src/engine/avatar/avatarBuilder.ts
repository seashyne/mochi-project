// Procedural 3D Humanoid Avatar Rig Builder with 6-part anatomy and walk/jump animations
// Constructs Head (cyber visor), Torso, Arms, and Legs with customizable color materials

import * as THREE from 'three';
import { AccessoryKind, ResolvedAccessories } from '../../api/types';
import { AccessoryInstance, createAccessoryGroup } from './avatarAccessories';

export type HumanoidPart = 'head' | 'torso' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
export type AvatarAnimationState = 'idle' | 'walk' | 'jump';

export interface UserAvatarColors {
  headColor: string;
  torsoColor: string;
  leftArmColor: string;
  rightArmColor: string;
  leftLegColor: string;
  rightLegColor: string;
  hatId?: string;
  shirtId?: string;
}

export const DEFAULT_AVATAR_COLORS: UserAvatarColors = {
  headColor: '#fcd34d',
  torsoColor: '#0284c7',
  leftArmColor: '#fcd34d',
  rightArmColor: '#fcd34d',
  leftLegColor: '#1e293b',
  rightLegColor: '#1e293b'
};

export interface HumanoidAvatarInstance {
  root: THREE.Group;
  parts: Record<HumanoidPart, THREE.Group>;
  materials: Record<HumanoidPart, THREE.MeshStandardMaterial>;
  colors: UserAvatarColors;
  state: AvatarAnimationState;
  walkPhase: number;
  updatePartColor: (part: HumanoidPart, hexColor: string) => void;
  updateColors: (colors: Partial<UserAvatarColors>) => void;
  setAccessories: (accessories: ResolvedAccessories) => void;
  stepWalkCycle: (speed: number, dt: number) => void;
  setJumpPose: (isJumping: boolean) => void;
  stepAnimation: (timeSeconds: number, state: AvatarAnimationState) => void;
  dispose: () => void;
}

export function buildHumanoidAvatar(
  customColors?: Partial<UserAvatarColors>,
  accessories?: ResolvedAccessories
): HumanoidAvatarInstance {
  const colors: UserAvatarColors = { ...DEFAULT_AVATAR_COLORS, ...customColors };
  const root = new THREE.Group();
  root.name = 'humanoid_avatar';

  // Materials for each anatomical part
  const materials: Record<HumanoidPart, THREE.MeshStandardMaterial> = {
    head: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.headColor), roughness: 0.35, metalness: 0.1 }),
    torso: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.torsoColor), roughness: 0.4, metalness: 0.1 }),
    leftArm: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.leftArmColor), roughness: 0.35, metalness: 0.1 }),
    rightArm: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.rightArmColor), roughness: 0.35, metalness: 0.1 }),
    leftLeg: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.leftLegColor), roughness: 0.5, metalness: 0.1 }),
    rightLeg: new THREE.MeshStandardMaterial({ color: new THREE.Color(colors.rightLegColor), roughness: 0.5, metalness: 0.1 })
  };

  // 1. Head Group and Mesh with Cyan Cyber Visor
  const headGroup = new THREE.Group();
  headGroup.name = 'avatar_head';
  headGroup.position.set(0, 2.2, 0);

  const headGeom = new THREE.BoxGeometry(0.55, 0.55, 0.55);
  const headMesh = new THREE.Mesh(headGeom, materials.head);
  headMesh.castShadow = true;
  headGroup.add(headMesh);

  // Glowing Cyber Visor
  const visorGeom = new THREE.BoxGeometry(0.58, 0.16, 0.2);
  const visorMat = new THREE.MeshBasicMaterial({ color: 0x00e5ff });
  const visorMesh = new THREE.Mesh(visorGeom, visorMat);
  visorMesh.position.set(0, 0.05, 0.22);
  headGroup.add(visorMesh);

  // 2. Torso Group and Mesh
  const torsoGroup = new THREE.Group();
  torsoGroup.name = 'avatar_torso';
  torsoGroup.position.set(0, 1.4, 0);

  const torsoGeom = new THREE.BoxGeometry(0.85, 0.95, 0.5);
  const torsoMesh = new THREE.Mesh(torsoGeom, materials.torso);
  torsoMesh.castShadow = true;
  torsoGroup.add(torsoMesh);

  // 3. Left Arm Group (pivot at shoulder)
  const leftArmGroup = new THREE.Group();
  leftArmGroup.name = 'avatar_left_arm';
  leftArmGroup.position.set(-0.9, 1.4, 0);

  const armGeom = new THREE.BoxGeometry(0.35, 0.8, 0.35);
  const leftArmMesh = new THREE.Mesh(armGeom, materials.leftArm);
  leftArmMesh.position.set(0, -0.4, 0);
  leftArmMesh.castShadow = true;
  leftArmGroup.add(leftArmMesh);

  // 4. Right Arm Group (pivot at shoulder)
  const rightArmGroup = new THREE.Group();
  rightArmGroup.name = 'avatar_right_arm';
  rightArmGroup.position.set(0.9, 1.4, 0);

  const rightArmMesh = new THREE.Mesh(armGeom, materials.rightArm);
  rightArmMesh.position.set(0, -0.4, 0);
  rightArmMesh.castShadow = true;
  rightArmGroup.add(rightArmMesh);

  // 5. Left Leg Group (pivot at hip)
  const leftLegGroup = new THREE.Group();
  leftLegGroup.name = 'avatar_left_leg';
  leftLegGroup.position.set(-0.4, 0.5, 0);

  const legGeom = new THREE.BoxGeometry(0.38, 0.9, 0.38);
  const leftLegMesh = new THREE.Mesh(legGeom, materials.leftLeg);
  leftLegMesh.position.set(0, -0.45, 0);
  leftLegMesh.castShadow = true;
  leftLegGroup.add(leftLegMesh);

  // 6. Right Leg Group (pivot at hip)
  const rightLegGroup = new THREE.Group();
  rightLegGroup.name = 'avatar_right_leg';
  rightLegGroup.position.set(0.4, 0.5, 0);

  const rightLegMesh = new THREE.Mesh(legGeom, materials.rightLeg);
  rightLegMesh.position.set(0, -0.45, 0);
  rightLegMesh.castShadow = true;
  rightLegGroup.add(rightLegMesh);

  // Attach all anatomical parts to root group
  root.add(headGroup);
  root.add(torsoGroup);
  root.add(leftArmGroup);
  root.add(rightArmGroup);
  root.add(leftLegGroup);
  root.add(rightLegGroup);

  const parts: Record<HumanoidPart, THREE.Group> = {
    head: headGroup,
    torso: torsoGroup,
    leftArm: leftArmGroup,
    rightArm: rightArmGroup,
    leftLeg: leftLegGroup,
    rightLeg: rightLegGroup
  };

  const accessorySlots: Record<AccessoryKind, THREE.Group> = { hat: headGroup, shirt: torsoGroup };
  const equipped: Partial<Record<AccessoryKind, AccessoryInstance>> = {};
  const equippedKeys: Partial<Record<AccessoryKind, string>> = {};

  const setAccessories = (next: ResolvedAccessories) => {
    for (const kind of Object.keys(accessorySlots) as AccessoryKind[]) {
      const desired = next[kind];
      const key = desired ? `${desired.style}:${desired.color}` : '';
      if (equippedKeys[kind] === key) continue;

      const current = equipped[kind];
      if (current) {
        current.group.removeFromParent();
        current.dispose();
        delete equipped[kind];
      }
      if (desired) {
        const created = createAccessoryGroup(kind, desired);
        accessorySlots[kind].add(created.group);
        equipped[kind] = created;
      }
      equippedKeys[kind] = key;
    }
  };

  setAccessories(accessories || {});

  const instance: HumanoidAvatarInstance = {
    root,
    parts,
    materials,
    colors,
    state: 'idle',
    walkPhase: 0,
    updatePartColor: (part: HumanoidPart, hexColor: string) => {
      const mat = materials[part];
      if (mat) {
        mat.color.set(hexColor);
        const colorKey = `${part}Color` as keyof UserAvatarColors;
        colors[colorKey] = hexColor;
      }
    },
    updateColors: (newColors: Partial<UserAvatarColors>) => {
      Object.assign(colors, newColors);
      for (const p of Object.keys(materials) as HumanoidPart[]) {
        const colorKey = `${p}Color` as keyof UserAvatarColors;
        if (newColors[colorKey]) {
          materials[p].color.set(newColors[colorKey]!);
        }
      }
    },
    setAccessories,
    stepWalkCycle: (speed: number, dt: number) => {
      stepWalkCycle(instance, speed, dt);
    },
    setJumpPose: (isJumping: boolean) => {
      setJumpPose(instance, isJumping);
    },
    stepAnimation: (timeSeconds: number, state: AvatarAnimationState) => {
      stepAnimation(instance, timeSeconds, state);
    },
    dispose: () => {
      Object.values(equipped).forEach((accessory) => accessory?.dispose());
      headGeom.dispose();
      visorGeom.dispose();
      visorMat.dispose();
      torsoGeom.dispose();
      armGeom.dispose();
      legGeom.dispose();
      Object.values(materials).forEach((mat) => mat.dispose());
      root.clear();
    }
  };

  return instance;
}

export function stepAnimation(
  avatar: HumanoidAvatarInstance,
  timeSeconds: number,
  state: AvatarAnimationState
): void {
  avatar.state = state;
  if (state === 'walk') {
    const angle = Math.sin(timeSeconds * 8) * 0.6;
    avatar.parts.leftArm.rotation.x = -angle;
    avatar.parts.rightArm.rotation.x = angle;
    avatar.parts.leftLeg.rotation.x = angle;
    avatar.parts.rightLeg.rotation.x = -angle;
  } else if (state === 'jump') {
    avatar.parts.leftArm.rotation.x = -Math.PI * 0.7;
    avatar.parts.rightArm.rotation.x = -Math.PI * 0.7;
    avatar.parts.leftLeg.rotation.x = 0.3;
    avatar.parts.rightLeg.rotation.x = 0.3;
  } else {
    avatar.parts.leftArm.rotation.x = 0;
    avatar.parts.rightArm.rotation.x = 0;
    avatar.parts.leftLeg.rotation.x = 0;
    avatar.parts.rightLeg.rotation.x = 0;
  }
}

export function stepWalkCycle(avatar: HumanoidAvatarInstance, speed: number, dt: number): void {
  if (speed > 0.05) {
    avatar.walkPhase += dt * Math.max(1, speed) * 1.5;
    stepAnimation(avatar, avatar.walkPhase, 'walk');
  } else if (avatar.state !== 'idle') {
    avatar.walkPhase = 0;
    stepAnimation(avatar, 0, 'idle');
  }
}

export function setJumpPose(avatar: HumanoidAvatarInstance, isJumping: boolean): void {
  if (isJumping) {
    stepAnimation(avatar, 0, 'jump');
  } else if (avatar.state === 'jump') {
    avatar.walkPhase = 0;
    stepAnimation(avatar, 0, 'idle');
  }
}
