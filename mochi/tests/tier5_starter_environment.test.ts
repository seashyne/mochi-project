// Tier 5 adversarial tests: starter skybox catalog, environment coercion, and
// bundled asset integrity.

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  DEFAULT_SKYBOX_ID,
  STARTER_ENVIRONMENT,
  clampNumber,
  normalizeEnvironmentState,
  normalizeHexColor
} from '../src/engine/environment/environmentTypes';
import {
  SKYBOX_PRESETS,
  getSkyboxPreset,
  isValidSkyboxId,
  resolveSkyboxUrl
} from '../src/engine/environment/skyboxPresets';

const publicDir = path.resolve(__dirname, '..', 'public');
const isValid = (id: string) => isValidSkyboxId(id);

describe('Tier 5: Starter Environment Hardening', () => {
  describe('Skybox catalog integrity', () => {
    it('ships at least five presets with unique ids', () => {
      expect(SKYBOX_PRESETS.length).toBeGreaterThanOrEqual(5);
      const ids = SKYBOX_PRESETS.map((preset) => preset.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('every preset points at a bundled EXR that exists on disk', () => {
      for (const preset of SKYBOX_PRESETS) {
        const relative = preset.environment.replace(/^\//, '');
        const absolute = path.join(publicDir, relative);
        expect(fs.existsSync(absolute), `missing ${preset.environment}`).toBe(true);
        expect(fs.statSync(absolute).size).toBeGreaterThan(1024);
      }
    });

    it('every preset preview thumbnail exists and is web-sized', () => {
      for (const preset of SKYBOX_PRESETS) {
        if (!preset.preview) continue;
        const absolute = path.join(publicDir, preset.preview.replace(/^\//, ''));
        expect(fs.existsSync(absolute), `missing ${preset.preview}`).toBe(true);
        expect(fs.statSync(absolute).size).toBeLessThan(2 * 1024 * 1024);
      }
    });

    it('generated manifest.json matches the runtime preset catalog', () => {
      const manifestPath = path.join(publicDir, 'skyboxes', 'manifest.json');
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as Array<{ id: string }>;
      expect(manifest.map((entry) => entry.id).sort()).toEqual(
        SKYBOX_PRESETS.map((preset) => preset.id).sort()
      );
    });

    it('rejects unknown skybox ids and falls back to the default preset', () => {
      expect(isValidSkyboxId('day_clear')).toBe(true);
      expect(isValidSkyboxId('../../etc/passwd')).toBe(false);
      expect(isValidSkyboxId('')).toBe(false);
      expect(getSkyboxPreset('does_not_exist').id).toBe(DEFAULT_SKYBOX_ID);
      expect(getSkyboxPreset(null).id).toBe(DEFAULT_SKYBOX_ID);
    });

    it('keeps every preset lighting value physically sane', () => {
      for (const preset of SKYBOX_PRESETS) {
        expect(preset.exposure).toBeGreaterThan(0);
        expect(preset.exposure).toBeLessThanOrEqual(4);
        expect(preset.sunIntensity).toBeGreaterThanOrEqual(0);
        expect(preset.ambientIntensity).toBeGreaterThanOrEqual(0);
        expect(preset.fogDensity).toBeGreaterThanOrEqual(0);
        expect(preset.fogColor).toMatch(/^#[0-9a-f]{6}$/);
      }
    });
  });

  describe('Environment state coercion', () => {
    it('returns the starter environment for empty input', () => {
      expect(normalizeEnvironmentState(null, isValid)).toEqual(STARTER_ENVIRONMENT);
      expect(normalizeEnvironmentState(undefined, isValid)).toEqual(STARTER_ENVIRONMENT);
      expect(normalizeEnvironmentState({}, isValid)).toEqual(STARTER_ENVIRONMENT);
    });

    it('clamps out-of-range numeric values instead of trusting them', () => {
      const state = normalizeEnvironmentState(
        {
          exposure: 999,
          sunAzimuth: -720,
          sunElevation: 500,
          ambientIntensity: -5,
          fogDensity: 99
        },
        isValid
      );
      expect(state.exposure).toBeLessThanOrEqual(4);
      expect(state.sunAzimuth).toBeGreaterThanOrEqual(0);
      expect(state.sunAzimuth).toBeLessThanOrEqual(360);
      expect(state.sunElevation).toBeLessThanOrEqual(90);
      expect(state.ambientIntensity).toBeGreaterThanOrEqual(0);
      expect(state.fogDensity).toBeLessThanOrEqual(0.2);
    });

    it('rejects NaN, Infinity, and non-numeric strings', () => {
      const state = normalizeEnvironmentState(
        { exposure: Number.NaN, sunElevation: Number.POSITIVE_INFINITY, ambientIntensity: 'bright' },
        isValid
      );
      expect(state.exposure).toBe(STARTER_ENVIRONMENT.exposure);
      expect(state.sunElevation).toBe(STARTER_ENVIRONMENT.sunElevation);
      expect(state.ambientIntensity).toBe(STARTER_ENVIRONMENT.ambientIntensity);
    });

    it('drops prototype-pollution style keys and keeps the schema closed', () => {
      const hostile = JSON.parse('{"__proto__": {"polluted": true}, "skyboxId": "sunset"}');
      const state = normalizeEnvironmentState(hostile, isValid);
      expect(Object.keys(state).sort()).toEqual(
        ['ambientIntensity', 'exposure', 'fogColor', 'fogDensity', 'fogEnabled', 'skyboxId', 'sunAzimuth', 'sunElevation']
      );
      expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('falls back to the starter skybox when the id is invalid', () => {
      const state = normalizeEnvironmentState({ skyboxId: 'javascript:alert(1)' }, isValid);
      expect(state.skyboxId).toBe(DEFAULT_SKYBOX_ID);
    });

    it('normalizes hex colors and rejects malformed values', () => {
      expect(normalizeHexColor('#AABBCC', '#000000')).toBe('#aabbcc');
      expect(normalizeHexColor('red', '#000000')).toBe('#000000');
      expect(normalizeHexColor('#fff', '#000000')).toBe('#000000');
      expect(normalizeHexColor(42, '#000000')).toBe('#000000');
    });

    it('clamps numeric helper bounds deterministically', () => {
      expect(clampNumber(5, 0, 1, 0.5)).toBe(1);
      expect(clampNumber(-5, 0, 1, 0.5)).toBe(0);
      expect(clampNumber('abc', 0, 1, 0.5)).toBe(0.5);
      expect(clampNumber(undefined, 0, 1, 0.5)).toBe(0.5);
    });
  });

  describe('Asset origin resolution', () => {
    it('joins relative paths against a configured CDN base', () => {
      expect(resolveSkyboxUrl('/skyboxes/day_clear/env.exr', 'https://cdn.example.com')).toBe(
        'https://cdn.example.com/skyboxes/day_clear/env.exr'
      );
      expect(resolveSkyboxUrl('/skyboxes/day_clear/env.exr', 'https://cdn.example.com/')).toBe(
        'https://cdn.example.com/skyboxes/day_clear/env.exr'
      );
    });

    it('leaves absolute URLs and empty bases untouched', () => {
      expect(resolveSkyboxUrl('https://other.example.com/env.exr', 'https://cdn.example.com')).toBe(
        'https://other.example.com/env.exr'
      );
      expect(resolveSkyboxUrl('/skyboxes/day_clear/env.exr', '')).toBe('/skyboxes/day_clear/env.exr');
    });
  });
});
