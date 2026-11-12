// Distance culling and render-budget diagnostics for large worlds.

import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import {
  clearCullTargets,
  getCullTargetCount,
  registerCullTarget,
  updateDistanceCulling
} from '../src/engine/scene/distanceCulling';
import {
  DEFAULT_RENDER_BUDGET,
  isRenderBudgetExceeded,
  readRenderStats,
  RenderDiagnostics,
  RenderStats
} from '../src/engine/scene/renderBudget';

function fakeRenderer(stats: Partial<RenderStats> = {}) {
  return {
    info: {
      render: {
        calls: stats.drawCalls ?? 12,
        triangles: stats.triangles ?? 3400,
        lines: stats.lines ?? 0,
        points: stats.points ?? 0
      },
      memory: {
        textures: stats.textures ?? 4,
        geometries: stats.geometries ?? 7
      }
    }
  } as unknown as THREE.WebGLRenderer;
}

beforeEach(() => {
  clearCullTargets();
});

describe('distance culling', () => {
  it('hides targets beyond their configured distance and restores them', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh();
    scene.add(mesh);
    const unregister = registerCullTarget(mesh, 50);
    const camera = new THREE.PerspectiveCamera();

    mesh.position.set(10, 0, 0);
    camera.position.set(0, 0, 0);
    expect(updateDistanceCulling(camera)).toBe(0);
    expect(mesh.visible).toBe(true);

    mesh.position.set(80, 0, 0);
    expect(updateDistanceCulling(camera)).toBe(1);
    expect(mesh.visible).toBe(false);

    camera.position.set(78, 0, 0);
    expect(updateDistanceCulling(camera)).toBe(0);
    expect(mesh.visible).toBe(true);

    unregister();
    expect(getCullTargetCount()).toBe(0);
  });

  it('uses the default distance and drops detached targets', () => {
    const scene = new THREE.Scene();
    const mesh = new THREE.Mesh();
    scene.add(mesh);
    registerCullTarget(mesh);
    const camera = new THREE.PerspectiveCamera();

    mesh.position.set(0, 0, 0);
    expect(updateDistanceCulling(camera)).toBe(0);

    scene.remove(mesh);
    updateDistanceCulling(camera);
    expect(getCullTargetCount()).toBe(0);
  });
});

describe('render budget diagnostics', () => {
  it('reads draw calls, triangles, textures and geometries', () => {
    const stats = readRenderStats(
      fakeRenderer({ drawCalls: 42, triangles: 9000, textures: 8, geometries: 3 })
    );
    expect(stats).toEqual({
      drawCalls: 42,
      triangles: 9000,
      lines: 0,
      points: 0,
      textures: 8,
      geometries: 3
    });
  });

  it('flags only scenes above either budget limit', () => {
    const base = readRenderStats(fakeRenderer());
    expect(isRenderBudgetExceeded(base)).toBe(false);
    expect(
      isRenderBudgetExceeded(base, { maxDrawCalls: 5, maxTriangles: 100 })
    ).toBe(true);
    expect(
      isRenderBudgetExceeded(
        { ...base, drawCalls: 2000 },
        { maxDrawCalls: 2001, maxTriangles: 1_000_000 }
      )
    ).toBe(false);
  });

  it('tracks the last captured frame and allows budget overrides', () => {
    const diagnostics = new RenderDiagnostics();
    expect(diagnostics.getStats()).toBeNull();
    expect(diagnostics.overBudget()).toBe(false);

    diagnostics.capture(fakeRenderer({ drawCalls: 10 }));
    expect(diagnostics.getStats()?.drawCalls).toBe(10);
    expect(diagnostics.getBudget()).toEqual(DEFAULT_RENDER_BUDGET);

    diagnostics.setBudget({ maxDrawCalls: 5 });
    expect(diagnostics.overBudget()).toBe(true);
    expect(diagnostics.getBudget().maxTriangles).toBe(DEFAULT_RENDER_BUDGET.maxTriangles);
  });
});
