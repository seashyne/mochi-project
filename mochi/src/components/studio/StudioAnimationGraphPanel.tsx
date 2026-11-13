// Studio authoring surface for the animation state graph.
//
// Optional by design: a world without a graph just plays its clips, so the
// panel starts collapsed behind a create button and never blocks the clip
// editor. All edits go through animationGraphModel.ts, which also cleans up
// dangling references.

import React from 'react';
import { AlertTriangle, Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import type { MochiAnimationClip } from '../../engine/animation/clip';
import type { AnimParameterType, AnimStateMachineDef } from '../../engine/animation/stateMachine';
import {
  addParameter,
  addState,
  emptyGraph,
  graphIssues,
  nextId,
  removeParameter,
  removeState,
  updateState
} from './animationGraphModel';
import { StudioAnimationGraphTransitions } from './StudioAnimationGraphTransitions';

export interface StudioAnimationGraphPanelProps {
  graph: AnimStateMachineDef | null;
  clips: MochiAnimationClip[];
  onChange: (graph: AnimStateMachineDef | null) => void;
}

const FIELD = 'w-full px-2 py-1 rounded-md bg-studio-bg border border-studio-border text-xs text-studio-text focus:outline-none focus:border-studio-accent';
const LABEL = 'text-[10px] uppercase tracking-wide text-studio-muted';
const ICON_BUTTON = 'p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-bg';

const PARAMETER_TYPES: AnimParameterType[] = ['bool', 'number', 'trigger'];

export const StudioAnimationGraphPanel: React.FC<StudioAnimationGraphPanelProps> = ({ graph, clips, onChange }) => {
  const { t } = useI18n();
  const copy = t.animation;

  if (!graph) {
    return (
      <div className="flex flex-col gap-2 p-3 border-t border-studio-border" data-testid="animation-graph-empty">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-semibold text-studio-text">{copy.graphTitle}</h3>
          <button
            type="button"
            onClick={() => onChange(emptyGraph(clips))}
            disabled={clips.length === 0}
            className="flex items-center gap-1 px-2 py-1 rounded-lg bg-studio-accent/15 border border-studio-accent/50 text-studio-accent text-[11px] hover:bg-studio-accent/25 disabled:opacity-40"
            data-testid="animation-graph-create"
          >
            <Plus className="w-3 h-3" /> {copy.graphCreate}
          </button>
        </div>
        <p className="text-[11px] text-studio-muted">{copy.graphHint}</p>
      </div>
    );
  }

  const stateIds = graph.states.map((state) => state.id);
  const parameters = graph.parameters ?? [];
  const issues = graphIssues(graph, clips);

  const addNewState = () => {
    const id = nextId('state', stateIds);
    onChange(addState(graph, { id, clipId: clips[0]?.id ?? '' }));
  };

  const addNewParameter = () => {
    const name = nextId('param', parameters.map((parameter) => parameter.name));
    onChange(addParameter(graph, name, 'bool'));
  };

  return (
    <div className="flex flex-col gap-3 p-3 border-t border-studio-border" data-testid="animation-graph-panel">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold text-studio-text">{copy.graphTitle}</h3>
        <button
          type="button"
          onClick={() => onChange(null)}
          className={ICON_BUTTON}
          title={copy.graphRemove}
          data-testid="animation-graph-clear"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
      </div>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={LABEL}>{copy.graphStates}</span>
          <button type="button" onClick={addNewState} className={ICON_BUTTON} data-testid="animation-graph-add-state">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {graph.states.map((state) => (
          <div key={state.id} className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphStateId}</span>
              <input
                className={FIELD}
                value={state.id}
                onChange={(event) => onChange(updateState(graph, state.id, { id: event.target.value.trim() }))}
                data-testid={`animation-graph-state-id-${state.id}`}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphClip}</span>
              <select
                className={FIELD}
                value={state.clipId}
                onChange={(event) => onChange(updateState(graph, state.id, { clipId: event.target.value }))}
              >
                {clips.map((clip) => (
                  <option key={clip.id} value={clip.id}>{clip.name}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onChange(removeState(graph, state.id))}
              className={ICON_BUTTON}
              title={copy.graphRemove}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </section>

      <section className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <span className={LABEL}>{copy.graphParameters}</span>
          <button type="button" onClick={addNewParameter} className={ICON_BUTTON} data-testid="animation-graph-add-parameter">
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {parameters.length === 0 && <p className="text-[11px] text-studio-muted">{copy.graphNoParameters}</p>}
        {parameters.map((parameter) => (
          <div key={parameter.name} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-end">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphStateId}</span>
              <input
                className={FIELD}
                value={parameter.name}
                onChange={(event) => {
                  const next = event.target.value.trim();
                  if (!next) return;
                  const renamed = { ...parameter, name: next };
                  const others = parameters.filter((entry) => entry.name !== parameter.name);
                  onChange({ ...graph, parameters: [...others, renamed] });
                }}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphCondition}</span>
              <select
                className={FIELD}
                value={parameter.type}
                onChange={(event) => {
                  const type = event.target.value as AnimParameterType;
                  const next = { ...parameter, type, default: type === 'number' ? 0 : type === 'bool' ? false : undefined };
                  const others = parameters.filter((entry) => entry.name !== parameter.name);
                  onChange({ ...graph, parameters: [...others, next] });
                }}
              >
                {PARAMETER_TYPES.map((type) => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onChange(removeParameter(graph, parameter.name))}
              className={ICON_BUTTON}
              title={copy.graphRemove}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </section>

      <StudioAnimationGraphTransitions graph={graph} onChange={onChange} />

      {issues.length > 0 && (
        <div className="flex flex-col gap-1 rounded-lg border border-studio-warning/40 bg-studio-warning/10 p-2" data-testid="animation-graph-issues">
          <span className="flex items-center gap-1 text-[11px] font-medium text-studio-warning">
            <AlertTriangle className="w-3.5 h-3.5" /> {copy.graphIssues}
          </span>
          {issues.map((issue) => (
            <span key={issue} className="text-[10px] text-studio-warning/80">{issue}</span>
          ))}
        </div>
      )}
    </div>
  );
};

export default StudioAnimationGraphPanel;
