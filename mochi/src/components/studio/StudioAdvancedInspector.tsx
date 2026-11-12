// Property editor for the advanced object kinds: terrain, constraints, emitters.
// Rendered below the standard transform inspector only for those types.

import React from 'react';
import { Mountain, Link2, Sparkles } from 'lucide-react';
import type { StudioObject } from '../../engine/studio/types';
import {
  CONSTRAINT_KINDS,
  ConstraintKind,
  DEFAULT_PARTICLE,
  TERRAIN_MATERIAL_COLORS,
  TERRAIN_MATERIALS,
  ParticleShape
} from '../../engine/studio/advancedTypes';
import { createTerrainData } from '../../engine/studio/terrainCodec';
import { terrainStats } from '../../engine/studio/terrainEdit';

export interface StudioAdvancedInspectorProps {
  selectedObject: StudioObject | null;
  objects: StudioObject[];
  onUpdate: (id: string, updates: Partial<StudioObject>) => void;
}

const labelClass = 'text-[10px] font-mono text-studio-muted uppercase font-bold';
const inputClass = 'w-full px-2 py-1 text-[11px] rounded-lg bg-studio-bg border border-studio-border text-studio-text focus:outline-none focus:border-studio-accent';

const NumberField: React.FC<{
  label: string; value: number; min: number; max: number; step: number;
  onChange: (value: number) => void;
}> = ({ label, value, min, max, step, onChange }) => (
  <label className="space-y-1 block">
    <span className={labelClass}>{label}</span>
    <input type="number" value={value} min={min} max={max} step={step}
      onChange={(e) => onChange(Math.min(max, Math.max(min, Number(e.target.value) || 0)))}
      className={inputClass} />
  </label>
);

function Header({ icon, title, type }: { icon: React.ReactNode; title: string; type: string }) {
  return (
    <div className="flex items-center justify-between pb-1.5 border-b border-studio-border">
      <div className={`flex items-center gap-1.5 ${labelClass}`}>{icon}<span>{title}</span></div>
      <span className="text-[10px] font-mono text-studio-accent uppercase font-bold">{type}</span>
    </div>
  );
}

const TerrainSection: React.FC<{ obj: StudioObject; onUpdate: StudioAdvancedInspectorProps['onUpdate'] }> = ({ obj, onUpdate }) => {
  const data = obj.terrain ?? createTerrainData();
  const stats = terrainStats(data);
  const patch = (next: Partial<typeof data>) => onUpdate(obj.id, { terrain: { ...data, ...next } });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 text-center">
        {[['Cells', stats.cells], ['Filled', stats.filled], ['Max H', stats.maxHeight]].map(([k, v]) => (
          <div key={String(k)} className="p-1.5 rounded-lg bg-studio-bg border border-studio-border">
            <div className="text-[9px] font-mono text-studio-muted">{k}</div>
            <div className="text-xs font-mono font-bold text-studio-text">{v}</div>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Width" value={data.width} min={2} max={64} step={1}
          onChange={(width) => onUpdate(obj.id, { terrain: createTerrainData(width, data.depth) })} />
        <NumberField label="Depth" value={data.depth} min={2} max={64} step={1}
          onChange={(depth) => onUpdate(obj.id, { terrain: createTerrainData(data.width, depth) })} />
        <NumberField label="Cell Size" value={data.cellSize} min={0.5} max={16} step={0.5} onChange={(cellSize) => patch({ cellSize })} />
        <NumberField label="Voxel Height" value={data.voxelHeight} min={0.5} max={16} step={0.5} onChange={(voxelHeight) => patch({ voxelHeight })} />
      </div>
      <div className="flex flex-wrap gap-1.5">
        {TERRAIN_MATERIALS.map((id) => (
          <span key={id} className="flex items-center gap-1 text-[9px] font-mono text-studio-muted">
            <span className="w-2.5 h-2.5 rounded-sm border border-studio-border" style={{ backgroundColor: TERRAIN_MATERIAL_COLORS[id] }} />
            {id}
          </span>
        ))}
      </div>
      <button type="button" onClick={() => onUpdate(obj.id, { terrain: createTerrainData(data.width, data.depth) })}
        className="w-full py-1.5 rounded-lg bg-studio-card border border-studio-border text-[10px] font-mono text-studio-text hover:bg-studio-bg">
        Regenerate hills (resets sculpt)
      </button>
    </div>
  );
};

const ConstraintSection: React.FC<{ obj: StudioObject; objects: StudioObject[]; onUpdate: StudioAdvancedInspectorProps['onUpdate'] }> = ({ obj, objects, onUpdate }) => {
  const def = obj.constraint ?? { kind: 'weld' as ConstraintKind, attachment0: '', attachment1: '', stiffness: 0.6, damping: 0.15, restLength: 4, axis: { x: 0, y: 1, z: 0 } };
  const patch = (next: Partial<typeof def>) => onUpdate(obj.id, { constraint: { ...def, ...next } });
  const parts = objects.filter((o) => o.id !== obj.id && o.type !== 'terrain' && o.type !== 'constraint' && o.type !== 'particle');
  const select = (key: 'attachment0' | 'attachment1', value: string) => patch({ [key]: value });
  return (
    <div className="space-y-3">
      <label className="space-y-1 block">
        <span className={labelClass}>Joint kind</span>
        <select value={def.kind} onChange={(e) => patch({ kind: e.target.value as ConstraintKind })} className={inputClass}>
          {CONSTRAINT_KINDS.map((kind) => <option key={kind} value={kind}>{kind}</option>)}
        </select>
      </label>
      {(['attachment0', 'attachment1'] as const).map((key) => (
        <label key={key} className="space-y-1 block">
          <span className={labelClass}>{key === 'attachment0' ? 'Attachment A' : 'Attachment B'}</span>
          <select value={def[key]} onChange={(e) => select(key, e.target.value)} className={inputClass}>
            <option value="">-- none --</option>
            {parts.map((part) => <option key={part.id} value={part.id}>{part.name}</option>)}
          </select>
        </label>
      ))}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Stiffness" value={def.stiffness} min={0} max={1} step={0.05} onChange={(stiffness) => patch({ stiffness })} />
        <NumberField label="Damping" value={def.damping} min={0} max={1} step={0.05} onChange={(damping) => patch({ damping })} />
        <NumberField label="Rest Length" value={def.restLength} min={0} max={512} step={0.5} onChange={(restLength) => patch({ restLength })} />
        <NumberField label="Axis Y" value={def.axis.y} min={-1} max={1} step={1}
          onChange={(y) => patch({ axis: { ...def.axis, y } })} />
      </div>
      <p className="text-[9px] font-mono text-studio-muted">Both parts should be unanchored to see the joint move.</p>
    </div>
  );
};

const ParticleSection: React.FC<{ obj: StudioObject; onUpdate: StudioAdvancedInspectorProps['onUpdate'] }> = ({ obj, onUpdate }) => {
  const def = obj.particle ?? DEFAULT_PARTICLE;
  const patch = (next: Partial<typeof def>) => onUpdate(obj.id, { particle: { ...def, ...next } });
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="Rate / sec" value={def.rate} min={0} max={400} step={1} onChange={(rate) => patch({ rate })} />
        <NumberField label="Lifetime (s)" value={def.lifetime} min={0.1} max={20} step={0.1} onChange={(lifetime) => patch({ lifetime })} />
        <NumberField label="Speed" value={def.speed} min={0} max={100} step={0.5} onChange={(speed) => patch({ speed })} />
        <NumberField label="Spread" value={def.spread} min={0} max={4} step={0.1} onChange={(spread) => patch({ spread })} />
        <NumberField label="Size" value={def.size} min={0.01} max={4} step={0.02} onChange={(size) => patch({ size })} />
        <NumberField label="Gravity" value={def.gravity} min={-100} max={100} step={0.5} onChange={(gravity) => patch({ gravity })} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <label className="space-y-1 block">
          <span className={labelClass}>Shape</span>
          <select value={def.shape} onChange={(e) => patch({ shape: e.target.value as ParticleShape })} className={inputClass}>
            {(['spark', 'smoke', 'droplet'] as ParticleShape[]).map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>
        <label className="space-y-1 block">
          <span className={labelClass}>Colour</span>
          <input type="color" value={def.color} onChange={(e) => patch({ color: e.target.value })}
            className="w-full h-7 rounded-lg bg-studio-bg border border-studio-border cursor-pointer" />
        </label>
      </div>
      <button type="button" onClick={() => patch({ enabled: !def.enabled })}
        className={`w-full py-1.5 rounded-lg border text-[10px] font-mono ${def.enabled ? 'bg-studio-success/20 border-studio-success/40 text-studio-success' : 'bg-studio-card border-studio-border text-studio-muted'}`}>
        {def.enabled ? 'Emitting' : 'Paused'}
      </button>
    </div>
  );
};

export const StudioAdvancedInspector: React.FC<StudioAdvancedInspectorProps> = ({ selectedObject, objects, onUpdate }) => {
  if (!selectedObject) return null;
  const { type } = selectedObject;
  if (type !== 'terrain' && type !== 'constraint' && type !== 'particle') return null;
  const header = type === 'terrain'
    ? <Header icon={<Mountain className="w-3.5 h-3.5 studio-type-terrain" />} title="Terrain Grid" type={type} />
    : type === 'constraint'
      ? <Header icon={<Link2 className="w-3.5 h-3.5 studio-type-constraint" />} title="Joint Settings" type={type} />
      : <Header icon={<Sparkles className="w-3.5 h-3.5 studio-type-particle" />} title="Emitter Settings" type={type} />;
  return (
    <div className="space-y-3 p-3.5 rounded-xl bg-studio-panel border border-studio-border text-studio-text">
      {header}
      {type === 'terrain' && <TerrainSection obj={selectedObject} onUpdate={onUpdate} />}
      {type === 'constraint' && <ConstraintSection obj={selectedObject} objects={objects} onUpdate={onUpdate} />}
      {type === 'particle' && <ParticleSection obj={selectedObject} onUpdate={onUpdate} />}
    </div>
  );
};
