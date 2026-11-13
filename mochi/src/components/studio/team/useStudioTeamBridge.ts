// Adapter between the Studio editor shell and the Team Create system.
// It owns the draft hydration callback, remote manifest field application and
// saved-state callbacks so StudioPage only needs a single hook call.

import { useCallback, useRef } from 'react';
import type { StudioProjectDraft } from '@/api/studioDrafts';
import type { StudioObject } from '@/engine/studio/types';
import type { MochiAnimationClip } from '@/engine/animation/clip';
import type { AnimStateMachineDef } from '@/engine/animation/stateMachine';
import type { StudioDocumentApi } from '../useStudioDocument';
import type { ServerManifestController } from '../useServerManifest';
import type { TeamCreateApi } from './useTeamCreate';
import { useStudioDraftLoader } from '../useStudioDraftLoader';
import { useTeamCreate } from './useTeamCreate';

export interface StudioTeamBridgeOptions {
  mapId: string | null;
  token: string | null;
  selfId: string | null;
  doc: StudioDocumentApi;
  scriptCode: string;
  environment: unknown;
  setScriptCode: (code: string) => void;
  setTitle: (title: string) => void;
  setSlug: (slug: string) => void;
  setDescription: (description: string) => void;
  setDraftId: (id: string) => void;
  setLastSavedAt: (value: string) => void;
  replaceEnvironment: (next: unknown) => void;
  replaceAnimations?: (clips: MochiAnimationClip[]) => void;
  animations: MochiAnimationClip[];
  animationStateMachine: AnimStateMachineDef | null;
  replaceAnimationStateMachine?: (graph: AnimStateMachineDef | null) => void;
  serverManifest: ServerManifestController;
  markSaved: () => void;
}

interface ExternalMarks {
  snapshot: (objects: StudioObject[]) => void;
  fields: (fields: Record<string, unknown>) => void;
}

export function useStudioTeamBridge(options: StudioTeamBridgeOptions): TeamCreateApi {
  const ref = useRef(options);
  ref.current = options;
  const marks = useRef<ExternalMarks>({ snapshot: () => undefined, fields: () => undefined });

  const handleDraftLoaded = useCallback((draft: StudioProjectDraft, manifest: Record<string, unknown>) => {
    const current = ref.current;
    current.setDraftId(draft.id);
    current.setTitle(draft.title);
    if (draft.slug) current.setSlug(draft.slug);
    if (draft.description) current.setDescription(draft.description);

    // A cloud draft load is authoritative, not a local edit: mark both the
    // object list and the manifest fields before the diff effects can fire.
    const loadedFields: Record<string, unknown> = {};
    if (typeof manifest.scriptCode === 'string') loadedFields.scriptCode = manifest.scriptCode;
    if ('language' in manifest) loadedFields.language = manifest.language;
    if (manifest.environment) loadedFields.environment = manifest.environment;
    marks.current.fields(loadedFields);

    if (Array.isArray(manifest.objects)) {
      const loaded = manifest.objects as StudioObject[];
      marks.current.snapshot(loaded);
      current.doc.replaceObjects(loaded);
    }
    if (typeof manifest.scriptCode === 'string') current.setScriptCode(manifest.scriptCode);
    if (manifest.environment) current.replaceEnvironment(manifest.environment);
    current.serverManifest.replaceManifest(manifest);
    if (Array.isArray(manifest.animations)) current.replaceAnimations?.(manifest.animations as MochiAnimationClip[]);
    if (manifest.animationStateMachine !== undefined) {
      current.replaceAnimationStateMachine?.((manifest.animationStateMachine as AnimStateMachineDef | null) ?? null);
    }
  }, []);

  useStudioDraftLoader({ mapId: options.mapId, token: options.token, onLoaded: handleDraftLoaded });

  const handleRemoteFields = useCallback((fields: Record<string, unknown>) => {
    const current = ref.current;
    if (typeof fields.scriptCode === 'string') current.setScriptCode(fields.scriptCode);
    if (fields.environment) current.replaceEnvironment(fields.environment);
    if (Array.isArray(fields.animations)) current.replaceAnimations?.(fields.animations as MochiAnimationClip[]);
    if (fields.animationStateMachine !== undefined) {
      current.replaceAnimationStateMachine?.((fields.animationStateMachine as AnimStateMachineDef | null) ?? null);
    }
  }, []);

  const handleSaved = useCallback(() => {
    ref.current.setLastSavedAt(new Date().toLocaleTimeString());
    ref.current.markSaved();
  }, []);

  const team = useTeamCreate({
    draftId: options.mapId,
    token: options.token,
    selfId: options.selfId,
    objects: options.doc.objects,
    scriptCode: options.scriptCode,
    environment: options.environment,
    animations: options.animations,
    animationStateMachine: options.animationStateMachine,
    selectedIds: options.doc.selectedIds,
    onRemoteObjects: options.doc.applyRemoteObjects,
    onRemoteFields: handleRemoteFields,
    onSaved: handleSaved
  });

  marks.current.snapshot = team.markExternalSnapshot;
  marks.current.fields = team.markExternalFields;
  return team;
}
