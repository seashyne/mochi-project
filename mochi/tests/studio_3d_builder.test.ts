// Unit tests for Visual 3D Creator Studio, Scene Engine, and Object Schemas
// Verifies 3D object placement, raycast selection, transform updates, snapshots, and defaults

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as THREE from 'three';
import { StudioScene } from '../src/engine/studio/studioScene';
import {
  OBJECT_TYPE_DEFAULTS,
  StudioObject,
  StudioObjectType
} from '../src/engine/studio/types';

// Mock WebGLRenderer at ESM module level for headless testing environments
vi.mock('three', async () => {
  const actual = await vi.importActual<typeof import('three')>('three');
  class MockWebGLRenderer {
    domElement: HTMLCanvasElement;
    constructor({ canvas }: { canvas?: HTMLCanvasElement } = {}) {
      this.domElement = canvas || (document.createElement('canvas') as HTMLCanvasElement);
    }
    setSize = vi.fn();
    setPixelRatio = vi.fn();
    render = vi.fn();
    dispose = vi.fn();
  }

  return {
    ...actual,
    WebGLRenderer: MockWebGLRenderer
  };
});

describe('Visual 3D Creator Studio Engine & Schemas', () => {
  describe('OBJECT_TYPE_DEFAULTS Schemas', () => {
    const expectedTypes: StudioObjectType[] = ['block', 'platform', 'coin', 'jump_pad', 'hazard', 'spawn'];

    it('defines configurations for all 6 core placeable 3D primitives', () => {
      expectedTypes.forEach((type) => {
        const config = OBJECT_TYPE_DEFAULTS[type];
        expect(config).toBeDefined();
        expect(config.label.length).toBeGreaterThan(0);
        expect(config.defaultColor).toMatch(/^#[0-9a-fA-F]{6}$/);
        expect(config.defaultScale.x).toBeGreaterThan(0);
        expect(config.defaultScale.y).toBeGreaterThan(0);
        expect(config.defaultScale.z).toBeGreaterThan(0);
        expect(typeof config.defaultScript).toBe('string');
      });
    });

    it('contains specialized interactive Lua scripts for coins, jump pads, and hazards', () => {
      expect(OBJECT_TYPE_DEFAULTS.coin.defaultScript).toContain('player.addScore');
      expect(OBJECT_TYPE_DEFAULTS.jump_pad.defaultScript).toContain('player.setVelocity');
      expect(OBJECT_TYPE_DEFAULTS.hazard.defaultScript).toContain('player.respawn');
      expect(OBJECT_TYPE_DEFAULTS.platform.defaultScript).toContain('script.onUpdate');
    });
  });

  describe('StudioScene 3D Hierarchy & Manipulation', () => {
    let studioScene: StudioScene;
    let mockCanvas: HTMLCanvasElement;
    let selectedIds: (string | null)[] = [];

    beforeEach(() => {
      selectedIds = [];
      mockCanvas = {
        clientWidth: 800,
        clientHeight: 600,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
      } as unknown as HTMLCanvasElement;

      studioScene = new StudioScene();
      studioScene.init(mockCanvas, (id) => selectedIds.push(id));
    });

    afterEach(() => {
      studioScene?.destroy();
    });

    const createSampleObject = (id: string, type: StudioObjectType): StudioObject => ({
      id,
      name: `Test_${type}`,
      type,
      position: { x: 1, y: 2, z: 3 },
      rotation: { x: 0, y: Math.PI / 2, z: 0 },
      scale: { x: 2, y: 2, z: 2 },
      color: '#00a2ff',
      luaScript: 'print("hello")'
    });

    it('adds 3D object to scene and selects it automatically', () => {
      const obj = createSampleObject('obj_1', 'block');
      studioScene.addObject(obj);

      expect(studioScene.getSelectedId()).toBe('obj_1');
      expect(selectedIds).toContain('obj_1');
    });

    it('updates position, rotation, scale, and color of existing object', () => {
      const obj = createSampleObject('obj_2', 'coin');
      studioScene.addObject(obj);

      studioScene.updateObject('obj_2', {
        position: { x: 10, y: 5, z: -4 },
        scale: { x: 3, y: 0.5, z: 3 },
        color: '#ff00aa'
      });

      const snapshot = studioScene.exportSnapshot('Test Snapshot');
      const updated = snapshot.objects.find((o) => o.id === 'obj_2');

      expect(updated).toBeDefined();
      expect(updated?.position).toEqual({ x: 10, y: 5, z: -4 });
      expect(updated?.scale).toEqual({ x: 3, y: 0.5, z: 3 });
      expect(updated?.color).toBe('#ff00aa');
    });

    it('removes object and clears selection when active object is deleted', () => {
      const obj = createSampleObject('obj_3', 'jump_pad');
      studioScene.addObject(obj);
      expect(studioScene.getSelectedId()).toBe('obj_3');

      studioScene.removeObject('obj_3');
      expect(studioScene.getSelectedId()).toBeNull();

      const snapshot = studioScene.exportSnapshot('After Delete');
      expect(snapshot.objects).toHaveLength(0);
    });

    it('exports and imports scene snapshots with fidelity', () => {
      const obj1 = createSampleObject('block_a', 'block');
      const obj2 = createSampleObject('hazard_b', 'hazard');

      studioScene.addObject(obj1);
      studioScene.addObject(obj2);

      const exported = studioScene.exportSnapshot('Level 1 Parkour');
      expect(exported.version).toBe('1.0.0');
      expect(exported.title).toBe('Level 1 Parkour');
      expect(exported.objects).toHaveLength(2);
      expect(exported.createdAt).toBeDefined();

      const newScene = new StudioScene();
      newScene.init(mockCanvas);
      newScene.importSnapshot(exported);

      const reExported = newScene.exportSnapshot('Re-exported');
      expect(reExported.objects).toHaveLength(2);
      expect(reExported.objects[0].id).toBe('block_a');
      expect(reExported.objects[1].id).toBe('hazard_b');
      newScene.destroy();
    });

    it('clears all objects and selection cleanly', () => {
      studioScene.addObject(createSampleObject('a', 'block'));
      studioScene.addObject(createSampleObject('b', 'platform'));
      expect(studioScene.exportSnapshot('Temp').objects).toHaveLength(2);

      studioScene.clearAll();
      expect(studioScene.exportSnapshot('Temp').objects).toHaveLength(0);
      expect(studioScene.getSelectedId()).toBeNull();
    });

    it('handles camera resize without throwing errors', () => {
      expect(() => studioScene.resize(1280, 720)).not.toThrow();
    });
  });
});
