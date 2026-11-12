// Center region of the Studio workspace: the builder canvas with its animation
// side panel, the authoring script tab and the publish form.
//
// The page owns the state; this module only decides which surface the active
// ribbon tab maps to, so `StudioPage` stays a wiring file.

import React from 'react';
import { StudioScriptTab } from '../../components/studio/StudioScriptTab';
import { StudioAnimationEditor } from '../../components/studio/StudioAnimationEditor';
import { StudioPublishForm } from '../../components/studio/StudioPublishForm';
import type { StudioAnimationsApi } from '../../components/studio/useStudioAnimations';
import type { StudioRibbonTab } from '../../components/studio/shell/ribbonTypes';
import type { StudioObject } from '../../engine/studio/types';
import type { StudioScriptRunnerApi } from './useStudioScriptRunner';

export type EditorView = 'builder' | 'script' | 'animation' | 'publish';

export const VIEW_BY_TAB: Record<StudioRibbonTab, EditorView> = {
  home: 'builder',
  model: 'builder',
  terrain: 'builder',
  script: 'script',
  animation: 'animation',
  publish: 'publish'
};

export interface StudioScriptView extends StudioScriptRunnerApi {
  code: string;
  onCodeChange: (code: string) => void;
}

export interface StudioPublishView {
  title: string;
  slug: string;
  versionNumber: string;
  description: string;
  notice: string | null;
  error: string | null;
  isPublishing: boolean;
  progress: string | null;
  onTitleChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onVersionChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onSubmit: (event: React.FormEvent) => void;
}

export interface StudioViewportProps {
  view: EditorView;
  canvas: React.ReactNode;
  objects: StudioObject[];
  animation: StudioAnimationsApi;
  script: StudioScriptView;
  publish: StudioPublishView;
}

export const StudioViewport: React.FC<StudioViewportProps> = ({ view, canvas, objects, animation, script, publish }) => {
  if (view === 'script') {
    return (
      <StudioScriptTab
        code={script.code}
        onCodeChange={script.onCodeChange}
        onRunTest={() => void script.runTest(script.code)}
        isTesting={script.isTesting}
        logs={script.logs}
        executionTimeMs={script.executionTimeMs}
        hasError={script.hasError}
        errorMessage={script.errorMessage}
        onClear={script.clearLogs}
      />
    );
  }

  if (view === 'publish') {
    return (
      <div className="flex-1 overflow-y-auto p-4">
        <div className="max-w-2xl mx-auto space-y-3">
          {publish.error && (
            <div className="p-3 bg-studio-danger/10 border border-studio-danger/30 rounded-xl text-xs text-studio-danger">
              {publish.error}
            </div>
          )}
          <StudioPublishForm
            title={publish.title}
            slug={publish.slug}
            versionNumber={publish.versionNumber}
            description={publish.description}
            objects={objects}
            publishNotice={publish.notice}
            isPublishing={publish.isPublishing}
            publishProgress={publish.progress}
            onTitleChange={publish.onTitleChange}
            onSlugChange={publish.onSlugChange}
            onVersionChange={publish.onVersionChange}
            onDescChange={publish.onDescriptionChange}
            onSubmit={publish.onSubmit}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex min-h-0">
      {canvas}
      {view === 'animation' && (
        <div className="w-[380px] shrink-0 border-l border-studio-border bg-studio-panel min-h-0 overflow-hidden">
          <StudioAnimationEditor api={animation} objects={objects} />
        </div>
      )}
    </div>
  );
};
