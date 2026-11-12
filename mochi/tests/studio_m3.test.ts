// Milestone 3 Unit Test Suite: Studio Routing, Gizmos, Hierarchy, Materials, and Lua Tokenizer

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  isStudioPathname,
  parseStudioParams,
  parseStudioRoute,
  resolveNavPath
} from '../src/routes/studioRouting';
import { tokenizeLuaLine } from '../src/components/studio/luaTokenizer';
import { isDescendant } from '../src/engine/studio/hierarchy';
import { buildObjectMesh, createStudioMaterial } from '../src/engine/studio/studioMeshBuilder';
import { TransformGizmoController } from '../src/engine/studio/transformGizmo';
import { StudioObject } from '../src/engine/studio/types';

describe('Milestone 3: Mochi Studio Architecture', () => {
  describe('Studio Routing Helpers', () => {
    it('accurately identifies studio pathnames', () => {
      expect(isStudioPathname('/studio')).toBe(true);
      expect(isStudioPathname('/studio/')).toBe(true);
      expect(isStudioPathname('/studio/project_42')).toBe(true);
      expect(isStudioPathname('/studio/projects/category/sublevel')).toBe(true);
      expect(isStudioPathname('/games')).toBe(false);
      expect(isStudioPathname('/admin')).toBe(false);
      expect(isStudioPathname('/')).toBe(false);
    });

    it('extracts project IDs from query strings and path segments', () => {
      expect(parseStudioParams('?projectId=proj_alpha')).toBe('proj_alpha');
      expect(parseStudioParams('?foo=bar&projectId=proj_beta')).toBe('proj_beta');
      expect(parseStudioParams('?invalid=123')).toBeNull();
      expect(parseStudioParams('')).toBeNull();

      const routeQuery = parseStudioRoute('/studio', '?projectId=proj_gamma');
      expect(routeQuery.isStudio).toBe(true);
      expect(routeQuery.projectId).toBe('proj_gamma');

      const routePath = parseStudioRoute('/studio/proj_delta', '');
      expect(routePath.isStudio).toBe(true);
      expect(routePath.projectId).toBe('proj_delta');

      const nonStudio = parseStudioRoute('/catalog', '?projectId=proj_omega');
      expect(nonStudio.isStudio).toBe(false);
      expect(nonStudio.projectId).toBeNull();
    });

    it('resolves tab navigation destinations', () => {
      expect(resolveNavPath('studio')).toBe('/studio');
      expect(resolveNavPath('admin')).toBe('/admin');
      expect(resolveNavPath('home')).toBe('/');
      expect(resolveNavPath('player')).toBe('/');
      expect(resolveNavPath('catalog')).toBe('/catalog');
      expect(resolveNavPath('friends')).toBe('/friends');
      expect(resolveNavPath('settings')).toBe('/settings');
    });
  });

  describe('Lua 5.4 Tokenizer', () => {
    it('identifies keywords, builtins, strings, and comments', () => {
      const line = 'local coin = script.parent -- attach coin logic';
      const tokens = tokenizeLuaLine(line);

      expect(tokens.some((t) => t.type === 'keyword' && t.value === 'local')).toBe(true);
      expect(tokens.some((t) => t.type === 'builtin' && t.value === 'script')).toBe(true);
      expect(tokens.some((t) => t.type === 'builtin' && t.value === 'parent')).toBe(true);
      expect(tokens.some((t) => t.type === 'comment' && t.value.includes('attach coin logic'))).toBe(true);
    });

    it('tokenizes numerical values and string literals', () => {
      const line = 'print("Score: ", 100, 3.14)';
      const tokens = tokenizeLuaLine(line);

      expect(tokens.some((t) => t.type === 'builtin' && t.value === 'print')).toBe(true);
      expect(tokens.some((t) => t.type === 'string' && t.value === '"Score: "')).toBe(true);
      expect(tokens.some((t) => t.type === 'number' && t.value === '100')).toBe(true);
      expect(tokens.some((t) => t.type === 'number' && t.value === '3.14')).toBe(true);
    });
  });

  describe('Transform Gizmo Controller', () => {
    it('switches modes and configures snapping values', () => {
      const gizmo = new TransformGizmoController();
      const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1000);
      const scene = new THREE.Scene();
      const mockEl = {
        style: {} as Record<string, string>,
        addEventListener: () => {},
        removeEventListener: () => {}
      } as unknown as HTMLElement;

      gizmo.init(camera, mockEl, scene);

      gizmo.setMode('rotate');
      expect(gizmo.getMode()).toBe('rotate');

      gizmo.setMode('scale');
      expect(gizmo.getMode()).toBe('scale');

      gizmo.setMode('translate');
      expect(gizmo.getMode()).toBe('translate');

      expect(gizmo.isSnapping()).toBe(false);
      gizmo.setSnapping(true);
      expect(gizmo.isSnapping()).toBe(true);
      gizmo.setSnapping(false);
      expect(gizmo.isSnapping()).toBe(false);

      gizmo.dispose(scene);
    });
  });

  describe('Studio Mesh Builder & Materials', () => {
    it('generates meshes with correct geometries and custom materials', () => {
      const sampleBlock: StudioObject = {
        id: 'b1',
        name: 'Block',
        type: 'block',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#00a2ff',
        material: 'neon'
      };

      const mesh = buildObjectMesh(sampleBlock);
      expect(mesh).toBeInstanceOf(THREE.Mesh);

      const mat = createStudioMaterial(new THREE.Color(0x00a2ff), 'neon') as THREE.MeshStandardMaterial;
      expect(mat.emissiveIntensity).toBeGreaterThan(0.5);

      const metalMat = createStudioMaterial(new THREE.Color(0xffffff), 'metal') as THREE.MeshStandardMaterial;
      expect(metalMat.metalness).toBeGreaterThan(0.9);

      const glassMat = createStudioMaterial(new THREE.Color(0xffffff), 'glass') as THREE.MeshStandardMaterial;
      expect(glassMat.transparent).toBe(true);
      expect(glassMat.opacity).toBe(0.5);

      const modelObj: StudioObject = {
        id: 'm1',
        name: 'Model_Container',
        type: 'model',
        position: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
        scale: { x: 1, y: 1, z: 1 },
        color: '#ffffff'
      };
      const modelMesh = buildObjectMesh(modelObj);
      expect(modelMesh).toBeInstanceOf(THREE.Group);
    });
  });

  describe('Hierarchy Cycle Detection', () => {
    it('detects circular parent-child ancestor relationships', () => {
      const objects: StudioObject[] = [
        { id: 'root', name: 'Root', type: 'model', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#fff' },
        { id: 'child', name: 'Child', type: 'model', parentId: 'root', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#fff' },
        { id: 'grandchild', name: 'GrandChild', type: 'block', parentId: 'child', position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 }, color: '#fff' }
      ];

      expect(isDescendant(objects, 'grandchild', 'root')).toBe(true);
      expect(isDescendant(objects, 'child', 'root')).toBe(true);
      expect(isDescendant(objects, 'root', 'grandchild')).toBe(false);
      expect(isDescendant(objects, 'root', 'child')).toBe(false);
    });
  });
});
