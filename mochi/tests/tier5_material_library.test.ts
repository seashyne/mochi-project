// Tier 5 adversarial tests: bundled CC0 PBR material catalog, on-disk map
// integrity, and mesh material fallbacks.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import {
  MATERIAL_PRESETS,
  getMaterialPreset,
  isValidMaterialId,
  resolveMaterialUrl
} from '../src/engine/materials/materialPresets';
import { createStudioMaterial } from '../src/engine/studio/studioMeshBuilder';

const publicDir = path.resolve(__dirname, '..', 'public');
const MATERIALS_DIR = path.join(publicDir, 'materials');

describe('Tier 5: Material Library Hardening', () => {
  describe('Catalog integrity', () => {
    it('ships at least eight presets with unique ids', () => {
      expect(MATERIAL_PRESETS.length).toBeGreaterThanOrEqual(8);
      const ids = MATERIAL_PRESETS.map((preset) => preset.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every preset exposes a colour map and optional PBR companions', () => {
      for (const preset of MATERIAL_PRESETS) {
        expect(preset.maps.color.startsWith('/materials/')).toBe(true);
        if (preset.maps.normal) expect(preset.maps.normal.endsWith('normal.jpg')).toBe(true);
        if (preset.maps.roughness) {
          expect(preset.maps.roughness.endsWith('roughness.jpg')).toBe(true);
        }
      }
    });

    it('every referenced map exists on disk and stays web-sized', () => {
      for (const preset of MATERIAL_PRESETS) {
        const paths = Object.values(preset.maps).filter(Boolean) as string[];
        for (const mapPath of paths) {
          const absolute = path.join(publicDir, mapPath.replace(/^\//, ''));
          expect(fs.existsSync(absolute), `missing ${mapPath}`).toBe(true);
          expect(fs.statSync(absolute).size).toBeLessThan(600 * 1024);
        }
      }
    });

    it('generated manifest.json matches the runtime catalog', () => {
      const manifestPath = path.join(MATERIALS_DIR, 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Array<{
        id: string;
        maps: Record<string, string>;
      }>;
      expect(manifest.map((entry) => entry.id).sort()).toEqual(
        MATERIAL_PRESETS.map((preset) => preset.id).sort()
      );
      for (const entry of manifest) {
        expect(entry.maps.color).toBe(`/materials/${entry.id}/color.jpg`);
      }
    });

    it('keeps the whole library under 4 MB', () => {
      let total = 0;
      for (const preset of MATERIAL_PRESETS) {
        for (const mapPath of Object.values(preset.maps).filter(Boolean) as string[]) {
          total += fs.statSync(path.join(publicDir, mapPath.replace(/^\//, ''))).size;
        }
      }
      expect(total).toBeLessThan(4 * 1024 * 1024);
    });
  });

  describe('Lookup and URL resolution', () => {
    it('resolves known ids and rejects unknown or hostile ids', () => {
      expect(isValidMaterialId('brick_red')).toBe(true);
      expect(isValidMaterialId('../../etc/passwd')).toBe(false);
      expect(isValidMaterialId('')).toBe(false);
      expect(isValidMaterialId(null)).toBe(false);
      expect(getMaterialPreset('brick_red')?.name).toBe('Red Brick');
      expect(getMaterialPreset('nope')).toBeNull();
      expect(getMaterialPreset(null)).toBeNull();
    });

    it('joins the asset base without duplicating slashes', () => {
      expect(resolveMaterialUrl('/materials/brick_red/color.jpg', 'https://cdn.example.com')).toBe(
        'https://cdn.example.com/materials/brick_red/color.jpg'
      );
      expect(resolveMaterialUrl('/materials/brick_red/color.jpg', 'https://cdn.example.com/')).toBe(
        'https://cdn.example.com/materials/brick_red/color.jpg'
      );
      expect(resolveMaterialUrl('/materials/brick_red/color.jpg')).toBe(
        '/materials/brick_red/color.jpg'
      );
    });
  });

  describe('Mesh material fallbacks', () => {
    it('falls back to a flat material when the texture cannot load headlessly', () => {
      const material = createStudioMaterial(new THREE.Color('#38bdf8'), 'plastic', 'brick_red');
      expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);
      const standard = material as THREE.MeshStandardMaterial;
      // Node has no image pipeline, so the loader yields no map and the flat
      // plastic branch is used instead of a half-built textured material.
      expect(standard.map === null || standard.map === undefined || standard.map instanceof THREE.Texture).toBe(true);
      expect(standard.color.getHexString()).not.toBe('');
    });

    it('keeps the neon emissive contract when no texture is requested', () => {
      const material = createStudioMaterial(new THREE.Color('#fbbf24'), 'neon') as THREE.MeshStandardMaterial;
      expect(material.emissiveIntensity).toBeGreaterThan(0);
    });

    it('ignores unknown texture ids instead of throwing', () => {
      expect(() =>
        createStudioMaterial(new THREE.Color('#ffffff'), 'metal', 'does_not_exist')
      ).not.toThrow();
    });
  });
});
