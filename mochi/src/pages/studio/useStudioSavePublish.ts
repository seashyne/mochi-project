// Draft save + publish submission for the Studio page.
//
// The page owns the document and draft-identity state; this hook owns the
// network round-trips plus the log lines that go with them, so `StudioPage` only
// wires surfaces together.

import type { FormEvent } from 'react';
import { studioDraftsApi } from '../../api/studioDrafts';
import type { StudioPublishInput } from '../../components/studio/useStudioPublish';
import type { ServerManifestController } from '../../components/studio/useServerManifest';
import type { StudioSystemLogApi } from '../../components/studio/shell/useStudioSystemLog';
import type { EnvironmentState } from '../../engine/environment/environmentTypes';
import type { AnimStateMachineDef } from '../../engine/animation/stateMachine';
import type { MochiAnimationClip } from '../../engine/animation/clip';
import type { StudioObject } from '../../engine/studio/types';

export interface StudioSaveTarget {
  title: string;
  slug: string;
  description: string;
  versionNumber: string;
  objects: StudioObject[];
  scriptCode: string;
  environment: EnvironmentState;
  animations: MochiAnimationClip[];
  animationStateMachine: AnimStateMachineDef | null;
}

export interface UseStudioSavePublishInput {
  token: string | null;
  userId: string | null;
  activeMapId: string | null;
  draftId: string | null;
  setDraftId: (id: string | null) => void;
  setLastSavedAt: (at: string | null) => void;
  setIsSaving: (saving: boolean) => void;
  target: StudioSaveTarget;
  serverManifest: ServerManifestController;
  log: StudioSystemLogApi;
  markSaved: () => void;
  isTeamLive: boolean;
  saveToTeam: () => void;
  publish: (input: StudioPublishInput) => Promise<boolean>;
  setPublishError: (message: string) => void;
}

export interface StudioSavePublishApi {
  saveDraft: () => Promise<void>;
  submitPublish: (event: FormEvent) => Promise<void>;
}

export function useStudioSavePublish(input: UseStudioSavePublishInput): StudioSavePublishApi {
  const {
    token, userId, activeMapId, draftId, setDraftId, setLastSavedAt, setIsSaving,
    target, serverManifest, log, markSaved, isTeamLive, saveToTeam, publish, setPublishError
  } = input;

  const saveDraft = async () => {
    if (!token || !userId) {
      log.push('warn', 'Cloud', 'Sign in to save this draft');
      return;
    }
    if (isTeamLive) {
      saveToTeam();
      return;
    }
    setIsSaving(true);
    try {
      const res = await studioDraftsApi.save({
        id: activeMapId || draftId || undefined,
        title: target.title.trim() || 'My Cyber Obby',
        slug: target.slug.trim() || undefined,
        description: target.description.trim() || undefined,
        objects: target.objects,
        scriptCode: target.scriptCode,
        environment: target.environment,
        serverScripts: serverManifest.serverScripts,
        remoteEvents: serverManifest.remoteEvents,
        animations: target.animations,
        animationStateMachine: target.animationStateMachine ?? undefined,
        versionNumber: target.versionNumber
      }, token);
      if (res?.draft?.id) {
        setDraftId(res.draft.id);
        setLastSavedAt(new Date().toLocaleTimeString());
        markSaved();
        log.push('success', 'Cloud', `Draft saved (${target.objects.length} parts)`);
      }
    } catch (err) {
      log.push('error', 'Cloud', err instanceof Error ? err.message : 'Draft save failed');
    } finally {
      setIsSaving(false);
    }
  };

  const submitPublish = async (event: FormEvent) => {
    event.preventDefault();
    if (!target.title.trim() || !token || !userId) {
      if (!token || !userId) setPublishError('Authentication required to publish games.');
      return;
    }
    const published = await publish({
      title: target.title,
      slug: target.slug,
      versionNumber: target.versionNumber,
      description: target.description,
      objects: target.objects,
      scriptCode: target.scriptCode,
      serverScripts: serverManifest.serverScripts,
      remoteEvents: serverManifest.remoteEvents,
      animations: target.animations,
      animationStateMachine: target.animationStateMachine,
      environment: target.environment,
      token,
      userId
    });
    if (published) {
      markSaved();
      log.push('success', 'Publish', `Released ${target.title} v${target.versionNumber}`);
    }
  };

  return { saveDraft, submitPublish };
}
