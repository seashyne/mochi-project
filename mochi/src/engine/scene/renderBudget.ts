// Per-frame render statistics and budget checks used by the runtime to spot
// scenes that exceed what the target device can comfortably draw.

import * as THREE from 'three';

export interface RenderStats {
  drawCalls: number;
  triangles: number;
  lines: number;
  points: number;
  textures: number;
  geometries: number;
}

export interface RenderBudget {
  maxDrawCalls: number;
  maxTriangles: number;
}

export const DEFAULT_RENDER_BUDGET: RenderBudget = {
  maxDrawCalls: 1500,
  maxTriangles: 1_500_000
};

export function readRenderStats(renderer: THREE.WebGLRenderer): RenderStats {
  const info = renderer.info;
  return {
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    lines: info.render.lines,
    points: info.render.points,
    textures: info.memory.textures,
    geometries: info.memory.geometries
  };
}

export function isRenderBudgetExceeded(
  stats: RenderStats,
  budget: RenderBudget = DEFAULT_RENDER_BUDGET
): boolean {
  return stats.drawCalls > budget.maxDrawCalls || stats.triangles > budget.maxTriangles;
}

export class RenderDiagnostics {
  private stats: RenderStats | null = null;
  private budget: RenderBudget = { ...DEFAULT_RENDER_BUDGET };

  public capture(renderer: THREE.WebGLRenderer): RenderStats {
    this.stats = readRenderStats(renderer);
    return this.stats;
  }

  public getStats(): RenderStats | null {
    return this.stats;
  }

  public setBudget(budget: Partial<RenderBudget>): void {
    this.budget = { ...this.budget, ...budget };
  }

  public getBudget(): RenderBudget {
    return { ...this.budget };
  }

  public overBudget(): boolean {
    return this.stats ? isRenderBudgetExceeded(this.stats, this.budget) : false;
  }
}
