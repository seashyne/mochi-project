// Ribbon group bodies per tab. Each group is a thin composition over the ribbon
// primitives so the tab dispatch in StudioRibbon stays readable.

import React from 'react';
import {
  Anchor,
  Clapperboard,
  Code2,
  Copy,
  FolderPlus,
  Grid,
  Layers,
  Link2,
  ListTree,
  Mountain,
  PanelLeft,
  Play,
  Save,
  SlidersHorizontal,
  Sparkles,
  Terminal,
  Trash2,
  Undo2,
  Unlink,
  UploadCloud
} from 'lucide-react';
import { RibbonButton, RibbonDivider, RibbonGroup } from './ribbonPrimitives';
import { BRUSHES, GIZMO_TOOLS, PART_MENU, PartMenuButton } from './ribbonCatalog';
import type { StudioRibbonActions } from './ribbonTypes';

export const HomeGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <>
    <RibbonGroup label="Tools">
      {GIZMO_TOOLS.map((tool) => (
        <RibbonButton
          key={tool.mode}
          icon={tool.icon}
          label={tool.label}
          active={a.gizmoMode === tool.mode}
          onClick={() => a.onGizmoMode(tool.mode)}
        />
      ))}
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Insert">
      <PartMenuButton onAddObject={a.onAddObject} />
      <RibbonButton
        icon={<Grid className="w-4 h-4" />}
        label="Snap"
        active={a.snapping}
        onClick={a.onToggleSnap}
        title="Snap to grid"
      />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Edit">
      <RibbonButton icon={<Undo2 className="w-4 h-4" />} label="Undo" disabled={!a.canUndo} onClick={a.onUndo} />
      <RibbonButton icon={<Trash2 className="w-4 h-4" />} label="Delete" disabled={!a.hasSelection} onClick={a.onDelete} />
      <RibbonButton icon={<Copy className="w-4 h-4" />} label="Duplicate" disabled={!a.hasSelection} onClick={a.onDuplicate} />
      <RibbonButton icon={<Anchor className="w-4 h-4" />} label="Anchor" active={a.isAnchored} disabled={!a.hasSelection} onClick={a.onToggleAnchor} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="View">
      <RibbonButton icon={<PanelLeft className="w-4 h-4" />} label="Toolbox" active={a.panels.toolbox} onClick={() => a.onTogglePanel('toolbox')} />
      <RibbonButton icon={<ListTree className="w-4 h-4" />} label="Explorer" active={a.panels.explorer} onClick={() => a.onTogglePanel('explorer')} />
      <RibbonButton icon={<SlidersHorizontal className="w-4 h-4" />} label="Properties" active={a.panels.properties} onClick={() => a.onTogglePanel('properties')} />
      <RibbonButton icon={<Terminal className="w-4 h-4" />} label="Output" active={a.panels.output} onClick={() => a.onTogglePanel('output')} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Test">
      <RibbonButton icon={<Play className="w-4 h-4 text-studio-success" />} label="Playtest" onClick={a.onPlaytest} testId="studio-ribbon-playtest" />
      <RibbonButton icon={<Save className="w-4 h-4" />} label={a.isSaving ? 'Saving' : 'Save'} disabled={a.isSaving} onClick={a.onSave} />
    </RibbonGroup>
  </>
);

export const ModelGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <>
    <RibbonGroup label="Parts">
      {PART_MENU.slice(0, 5).map((item) => (
        <RibbonButton key={item.type} icon={item.icon} label={item.label} onClick={() => a.onAddObject(item.type)} />
      ))}
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Gameplay">
      {PART_MENU.slice(5, 10).map((item) => (
        <RibbonButton key={item.type} icon={item.icon} label={item.label} onClick={() => a.onAddObject(item.type)} />
      ))}
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Advanced">
      <RibbonButton icon={<Mountain className="w-4 h-4 studio-type-terrain" />} label="Terrain" onClick={() => a.onAddObject('terrain')} />
      <RibbonButton icon={<Link2 className="w-4 h-4 studio-type-constraint" />} label="Joint" disabled={!a.hasSelection} onClick={a.onGroup} title="Group the selection before adding a joint" />
      <RibbonButton icon={<Sparkles className="w-4 h-4 studio-type-particle" />} label="Emitter" onClick={() => a.onAddObject('particle')} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Group">
      <RibbonButton icon={<FolderPlus className="w-4 h-4" />} label="Group" disabled={!a.hasSelection} onClick={a.onGroup} />
      <RibbonButton icon={<Unlink className="w-4 h-4" />} label="Ungroup" disabled={!a.hasSelection} onClick={a.onUngroup} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Assets">
      <RibbonButton icon={<UploadCloud className="w-4 h-4" />} label="Import" onClick={() => a.onOpenToolboxTab('import')} />
      <RibbonButton icon={<Layers className="w-4 h-4" />} label="Material" onClick={() => a.onOpenToolboxTab('materials')} />
    </RibbonGroup>
  </>
);

export const TerrainGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <>
    <RibbonGroup label="Sculpt">
      <RibbonButton
        icon={<Mountain className="w-4 h-4" />}
        label={a.isSculpting ? 'Stop' : 'Sculpt'}
        active={a.isSculpting}
        onClick={a.onToggleSculpting}
      />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Brushes">
      {BRUSHES.map((brush) => (
        <RibbonButton
          key={brush.tool}
          icon={brush.icon}
          label={brush.label}
          active={a.isSculpting && a.brush.tool === brush.tool}
          onClick={() => {
            a.onBrushChange({ tool: brush.tool });
            if (!a.isSculpting) a.onToggleSculpting();
          }}
        />
      ))}
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Add">
      <RibbonButton icon={<Mountain className="w-4 h-4 studio-type-terrain" />} label="Terrain" onClick={() => a.onAddObject('terrain')} />
      <RibbonButton icon={<Sparkles className="w-4 h-4 studio-type-particle" />} label="Emitter" onClick={() => a.onAddObject('particle')} />
    </RibbonGroup>
  </>
);

export const ScriptGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <>
    <RibbonGroup label="Editor">
      <RibbonButton icon={<Code2 className="w-4 h-4" />} label="Open Lua" onClick={() => a.onOpenToolboxTab('script')} />
      <RibbonButton icon={<Play className="w-4 h-4 text-studio-success" />} label="Run" onClick={a.onRunScript} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Server">
      <RibbonButton icon={<Terminal className="w-4 h-4" />} label="Scripts" onClick={() => a.onOpenToolboxTab('scripts')} />
    </RibbonGroup>
  </>
);

export const AnimationGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <RibbonGroup label="Clips">
    <RibbonButton icon={<Clapperboard className="w-4 h-4" />} label="Timeline" onClick={() => a.onOpenToolboxTab('script')} />
  </RibbonGroup>
);

export const PublishGroups: React.FC<{ a: StudioRibbonActions }> = ({ a }) => (
  <>
    <RibbonGroup label="Release">
      <RibbonButton icon={<UploadCloud className="w-4 h-4 text-studio-accent" />} label="Publish" onClick={a.onPublish} />
      <RibbonButton icon={<Save className="w-4 h-4" />} label="Save" disabled={a.isSaving} onClick={a.onSave} />
    </RibbonGroup>
    <RibbonDivider />
    <RibbonGroup label="Test">
      <RibbonButton icon={<Play className="w-4 h-4 text-studio-success" />} label="Playtest" onClick={a.onPlaytest} />
    </RibbonGroup>
  </>
);
