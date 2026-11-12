// Compact property grid for a selected part: identity, transform, appearance and
// behaviour. Rotation is authored in degrees and stored in radians.

import React from 'react';
import { OBJECT_TYPE_DEFAULTS, type StudioMaterial, type StudioObject } from '@/engine/studio/types';
import { PropertyGroupsView, type PropertyGroupDef } from './propertyControls';

const MATERIAL_OPTIONS: { value: StudioMaterial; label: string }[] = [
  { value: 'plastic', label: 'Plastic' },
  { value: 'neon', label: 'Neon' },
  { value: 'metal', label: 'Metal' },
  { value: 'glass', label: 'Glass' },
  { value: 'wood', label: 'Wood' }
];

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Material hues offered in the swatch row, mirroring the insert palette. */
export const COLOR_PRESETS = [
  '#6366f1',
  '#38bdf8',
  '#00a2ff',
  '#fbbf24',
  '#10b981',
  '#ef4444',
  '#ec4899',
  '#f97316'
];

export function buildObjectPropertyGroups(
  object: StudioObject,
  onUpdate: (id: string, updates: Partial<StudioObject>) => void
): PropertyGroupDef[] {
  const set = (updates: Partial<StudioObject>) => onUpdate(object.id, updates);
  const rotationDegrees = {
    x: Math.round(object.rotation.x * RAD_TO_DEG * 10) / 10,
    y: Math.round(object.rotation.y * RAD_TO_DEG * 10) / 10,
    z: Math.round(object.rotation.z * RAD_TO_DEG * 10) / 10
  };

  return [
    {
      title: 'Data',
      rows: [
        {
          key: 'name',
          label: 'Name',
          control: { type: 'text', value: object.name, onChange: (name) => set({ name }) }
        },
        {
          key: 'className',
          label: 'ClassName',
          control: {
            type: 'readonly',
            value: OBJECT_TYPE_DEFAULTS[object.type]?.label ?? object.type
          }
        },
        {
          key: 'parent',
          label: 'Parent',
          control: { type: 'readonly', value: object.parentId ? object.parentId : 'Workspace' }
        }
      ]
    },
    {
      title: 'Transform',
      rows: [
        {
          key: 'position',
          label: 'Position',
          control: {
            type: 'vector3',
            value: object.position,
            step: 0.25,
            onChange: (position) => set({ position })
          }
        },
        {
          key: 'rotation',
          label: 'Orientation',
          control: {
            type: 'vector3',
            value: rotationDegrees,
            step: 5,
            onChange: (degrees) =>
              set({
                rotation: {
                  x: degrees.x * DEG_TO_RAD,
                  y: degrees.y * DEG_TO_RAD,
                  z: degrees.z * DEG_TO_RAD
                }
              })
          }
        },
        {
          key: 'size',
          label: 'Size',
          control: {
            type: 'vector3',
            value: object.scale,
            step: 0.25,
            onChange: (scale) => set({ scale })
          }
        }
      ]
    },
    {
      title: 'Appearance',
      rows: [
        {
          key: 'color',
          label: 'Color',
          control: { type: 'swatches', value: object.color, presets: COLOR_PRESETS, onChange: (color) => set({ color }) }
        },
        {
          key: 'material',
          label: 'Material',
          control: {
            type: 'select',
            value: object.material ?? 'plastic',
            options: MATERIAL_OPTIONS,
            onChange: (material) => set({ material: material as StudioMaterial })
          }
        },
        {
          key: 'texture',
          label: 'Texture',
          control: {
            type: 'readonly',
            value: object.materialTexture || (object.textureAccessId ? 'Uploaded texture' : 'None')
          }
        }
      ]
    },
    {
      title: 'Behavior',
      rows: [
        {
          key: 'anchored',
          label: 'Anchored',
          control: {
            type: 'toggle',
            value: object.anchored !== false,
            onChange: (anchored) => set({ anchored })
          }
        },
        {
          key: 'canCollide',
          label: 'CanCollide',
          control: {
            type: 'toggle',
            value: object.canCollide !== false,
            onChange: (canCollide) => set({ canCollide })
          }
        }
      ]
    },
    {
      title: 'Script',
      rows: [
        {
          key: 'luaScript',
          label: 'Lua',
          control: {
            type: 'code',
            value: object.luaScript ?? '',
            rows: 4,
            placeholder: '-- runs on this part at runtime, e.g. script.parent.rotateY(90 * dt)',
            onChange: (luaScript) => set({ luaScript })
          }
        }
      ]
    }
  ];
}

export const StudioObjectProperties: React.FC<{
  object: StudioObject;
  onUpdate: (id: string, updates: Partial<StudioObject>) => void;
  filter?: string;
}> = ({ object, onUpdate, filter = '' }) => (
  <PropertyGroupsView groups={buildObjectPropertyGroups(object, onUpdate)} filter={filter} />
);
