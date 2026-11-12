// Studio document state: owns the object list, selection set and every mutation.
// All edits funnel through the history store so undo/redo covers the whole editor.

import { useCallback, useEffect, useRef, useState } from 'react';
import { StudioScene } from '../../engine/studio/studioScene';
import { OBJECT_TYPE_DEFAULTS, StudioObject, StudioObjectType, StudioVec3 } from '../../engine/studio/types';
import { createTerrainData } from '../../engine/studio/terrainCodec';
import { DEFAULT_CONSTRAINT, DEFAULT_PARTICLE } from '../../engine/studio/advancedTypes';
import { collectClipboard, offsetClipboard, remapClipboard } from '../../engine/studio/studioClipboard';
import type { TransformUpdate } from '../../engine/studio/multiTransform';
import { useStudioPatchHistory, type CommitOptions } from './useStudioPatchHistory';

export interface StudioDocumentApi {
  objects: StudioObject[];
  selectedIds: string[];
  selectedId: string | null;
  selectedObject: StudioObject | null;
  isDirty: boolean;
  canUndo: boolean;
  canRedo: boolean;
  clipboardCount: number;
  markSaved: () => void;
  copyObjects: (ids: string[]) => void;
  cutObjects: (ids: string[]) => void;
  pasteObjects: () => string[];
  transformMany: (updates: TransformUpdate[]) => void;
  addObject: (type: StudioObjectType, preset?: StudioObject) => string;
  updateObject: (id: string, updates: Partial<StudioObject>, options?: CommitOptions) => void;
  transformObject: (id: string, transform: { position: StudioVec3; rotation: StudioVec3; scale: StudioVec3 }) => void;
  deleteObjects: (ids: string[]) => void;
  duplicateObjects: (ids: string[]) => string[];
  toggleAnchor: (id: string) => void;
  groupSelected: (id: string) => void;
  ungroupSelected: (modelId: string) => void;
  select: (ids: string[]) => void;
  /** Selects one part and frames it in the viewport. */
  focusObject: (id: string) => void;
  toggleSelect: (id: string) => void;
  selectAll: () => void;
  replaceObjects: (objects: StudioObject[]) => void;
  /** Applies an authoritative remote snapshot without resetting selection. */
  applyRemoteObjects: (objects: StudioObject[]) => void;
  undo: () => void;
  redo: () => void;
}

let sequence = 0;

function nextObjectId(type: string): string {
  sequence += 1;
  return `obj_${type}_${Date.now()}_${sequence}`;
}

/** Expands a selection to include every descendant of any selected group. */
export function collectWithDescendants(objects: StudioObject[], ids: string[]): Set<string> {
  const doomed = new Set<string>(ids);
  let grew = true;
  while (grew) {
    grew = false;
    for (const obj of objects) {
      if (obj.parentId && doomed.has(obj.parentId) && !doomed.has(obj.id)) {
        doomed.add(obj.id);
        grew = true;
      }
    }
  }
  return doomed;
}

export function useStudioDocument(sceneEngine: StudioScene, initial: StudioObject[]): StudioDocumentApi {
  const { objects, revision, canUndo, canRedo, commit, replace, undo, redo } = useStudioPatchHistory(initial);
  const [selectedIds, setSelectedIds] = useState<string[]>(initial[0] ? [initial[0].id] : []);
  const [isDirty, setIsDirty] = useState(false);
  const clipboardRef = useRef<StudioObject[]>([]);
  const pasteCountRef = useRef(0);
  const [clipboardCount, setClipboardCount] = useState(0);

  const objectsRef = useRef(objects);
  objectsRef.current = objects;
  const selectedRef = useRef(selectedIds);
  selectedRef.current = selectedIds;
  // Start at -1 so the first effect run mirrors the initial objects into the
  // scene: StudioPage seeds them before the canvas init creates the scene.
  const appliedRevision = useRef(-1);

  // Undo, redo and remote loads rebuild the mirror; ordinary edits mutate it incrementally.
  useEffect(() => {
    if (revision === appliedRevision.current) return;
    appliedRevision.current = revision;
    const kept = selectedRef.current.filter((id) => objectsRef.current.some((o) => o.id === id));
    sceneEngine.replaceAll(objectsRef.current);
    sceneEngine.selectObjects(kept);
  }, [revision, sceneEngine]);

  const addObject = useCallback((type: StudioObjectType, preset?: StudioObject): string => {
    const def = OBJECT_TYPE_DEFAULTS[type];
    const newId = preset?.id ?? nextObjectId(type);
    const newObj: StudioObject = preset ?? {
      id: newId,
      name: `${type.charAt(0).toUpperCase() + type.slice(1)}_${objectsRef.current.length + 1}`,
      type,
      position: {
        x: (Math.random() - 0.5) * 6,
        y: def.defaultScale.y / 2,
        z: (Math.random() - 0.5) * 6
      },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { ...def.defaultScale },
      color: def.defaultColor,
      material: 'plastic',
      anchored: true,
      canCollide: true,
      luaScript: def.defaultScript,
      ...(type === 'terrain' ? { terrain: createTerrainData() } : {}),
      ...(type === 'constraint' ? { constraint: { ...DEFAULT_CONSTRAINT } } : {}),
      ...(type === 'particle' ? { particle: { ...DEFAULT_PARTICLE } } : {})
    };
    commit((prev) => [...prev, newObj]);
    sceneEngine.addObject(newObj);
    setSelectedIds([newId]);
    setIsDirty(true);
    return newId;
  }, [commit, sceneEngine]);

  const updateObject = useCallback((id: string, updates: Partial<StudioObject>, options?: CommitOptions) => {
    commit((prev) => prev.map((o) => (o.id === id ? { ...o, ...updates } : o)), options);
    sceneEngine.updateObject(id, updates);
    setIsDirty(true);
  }, [commit, sceneEngine]);

  // Gizmo drags fire per frame; the merge key collapses a whole drag into one undo step.
  const transformObject = useCallback((id: string, transform: { position: StudioVec3; rotation: StudioVec3; scale: StudioVec3 }) => {
    commit((prev) => prev.map((o) => (o.id === id ? { ...o, ...transform } : o)), { mergeKey: `transform:${id}` });
    setIsDirty(true);
  }, [commit]);

  const deleteObjects = useCallback((ids: string[]) => {
    if (ids.length === 0) return;
    const doomed = collectWithDescendants(objectsRef.current, ids);
    commit((prev) => prev.filter((o) => !doomed.has(o.id)));
    doomed.forEach((id) => sceneEngine.removeObject(id));
    setSelectedIds((prev) => prev.filter((id) => !doomed.has(id)));
    setIsDirty(true);
  }, [commit, sceneEngine]);

  const duplicateObjects = useCallback((ids: string[]): string[] => {
    const source = objectsRef.current.filter((o) => ids.includes(o.id));
    if (source.length === 0) return [];
    const clones = source.map((orig) => ({
      ...orig,
      id: nextObjectId(orig.type),
      name: `${orig.name}_Copy`,
      position: { x: orig.position.x + 1, y: orig.position.y, z: orig.position.z + 1 }
    }));
    commit((prev) => [...prev, ...clones]);
    clones.forEach((clone) => sceneEngine.addObject(clone));
    setSelectedIds(clones.map((clone) => clone.id));
    setIsDirty(true);
    return clones.map((clone) => clone.id);
  }, [commit, sceneEngine]);

  const copyObjects = useCallback((ids: string[]) => {
    clipboardRef.current = collectClipboard(objectsRef.current, ids);
    pasteCountRef.current = 0;
    setClipboardCount(clipboardRef.current.length);
  }, []);

  const cutObjects = useCallback((ids: string[]) => {
    copyObjects(ids);
    deleteObjects(ids);
  }, [copyObjects, deleteObjects]);

  const pasteObjects = useCallback((): string[] => {
    const source = clipboardRef.current;
    if (source.length === 0) return [];
    pasteCountRef.current += 1;
    const clones = offsetClipboard(remapClipboard(source, nextObjectId), pasteCountRef.current);
    commit((prev) => [...prev, ...clones]);
    clones.forEach((clone) => sceneEngine.addObject(clone));
    setSelectedIds(clones.filter((clone) => !clone.parentId).map((clone) => clone.id));
    setIsDirty(true);
    return clones.map((clone) => clone.id);
  }, [commit, sceneEngine]);

  const transformMany = useCallback((updates: TransformUpdate[]) => {
    if (updates.length === 0) return;
    const byId = new Map(updates.map((update) => [update.id, update.transform]));
    commit((prev) => prev.map((o) => (byId.has(o.id) ? { ...o, ...byId.get(o.id)! } : o)), { mergeKey: 'transform:multi' });
    setIsDirty(true);
  }, [commit]);

  const toggleAnchor = useCallback((id: string) => {
    const target = objectsRef.current.find((o) => o.id === id);
    if (!target) return;
    const nextAnchored = target.anchored === false;
    commit((prev) => prev.map((o) => (o.id === id ? { ...o, anchored: nextAnchored } : o)));
    sceneEngine.updateObject(id, { anchored: nextAnchored });
    setIsDirty(true);
  }, [commit, sceneEngine]);

  const groupSelected = useCallback((id: string) => {
    const modelId = nextObjectId('model');
    const newModel: StudioObject = {
      id: modelId,
      name: `Model_${objectsRef.current.filter((o) => o.type === 'model').length + 1}`,
      type: 'model',
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: { x: 1, y: 1, z: 1 },
      color: '#94a3b8'
    };
    commit((prev) => [...prev.map((o) => (o.id === id ? { ...o, parentId: modelId } : o)), newModel]);
    sceneEngine.addObject(newModel);
    setSelectedIds([modelId]);
    setIsDirty(true);
  }, [commit, sceneEngine]);

  const ungroupSelected = useCallback((modelId: string) => {
    commit((prev) => prev.filter((o) => o.id !== modelId).map((o) => (o.parentId === modelId ? { ...o, parentId: null } : o)));
    sceneEngine.removeObject(modelId);
    setSelectedIds([]);
    setIsDirty(true);
  }, [commit, sceneEngine]);

  const select = useCallback((ids: string[]) => {
    setSelectedIds(ids);
    sceneEngine.selectObjects(ids);
  }, [sceneEngine]);

  const focusObject = useCallback((id: string) => { select([id]); sceneEngine.focusSelection(); }, [select, sceneEngine]);

  const selectAll = useCallback(() => {
    select(objectsRef.current.map((o) => o.id));
  }, [select]);

  const toggleSelect = useCallback((id: string) => {
    const current = selectedRef.current;
    const next = current.includes(id) ? current.filter((curr) => curr !== id) : [...current, id];
    select(next);
  }, [select]);

  const replaceObjects = useCallback((next: StudioObject[]) => {
    replace(next);
    sceneEngine.replaceAll(next);
    setSelectedIds(next[0] ? [next[0].id] : []);
    setIsDirty(false);
  }, [replace, sceneEngine]);

  // Remote snapshots rebuild the scene mirror through the revision effect but
  // keep the local selection, which must not jump while teammates edit.
  const applyRemoteObjects = useCallback((next: StudioObject[]) => {
    replace(next);
    setIsDirty(false);
  }, [replace]);

  const handleUndo = useCallback(() => {
    if (undo()) setIsDirty(true);
  }, [undo]);

  const handleRedo = useCallback(() => {
    if (redo()) setIsDirty(true);
  }, [redo]);

  const markSaved = useCallback(() => setIsDirty(false), []);

  return {
    objects,
    selectedIds,
    selectedId: selectedIds[0] ?? null,
    selectedObject: objects.find((o) => o.id === selectedIds[0]) ?? null,
    isDirty,
    canUndo,
    canRedo,
    clipboardCount,
    markSaved,
    copyObjects,
    cutObjects,
    pasteObjects,
    transformMany,
    addObject,
    updateObject,
    transformObject,
    deleteObjects,
    duplicateObjects,
    toggleAnchor,
    groupSelected,
    ungroupSelected,
    select,
    focusObject,
    toggleSelect,
    selectAll,
    replaceObjects,
    applyRemoteObjects,
    undo: handleUndo,
    redo: handleRedo
  };
}
