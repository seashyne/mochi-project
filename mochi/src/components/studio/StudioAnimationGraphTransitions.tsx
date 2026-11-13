// Transition rows for the Studio state graph panel. Split from the container so
// each file stays small; the parent owns the create/delete buttons for states
// and parameters, this one owns everything between states.

import React from 'react';
import { Plus, Trash2 } from 'lucide-react';
import { useI18n } from '../../i18n/context';
import { ANY_STATE, type AnimStateMachineDef } from '../../engine/animation/stateMachine';
import { addCondition, addTransition, removeCondition, removeTransition, updateCondition, updateTransition } from './animationGraphModel';

export interface StudioAnimationGraphTransitionsProps {
  graph: AnimStateMachineDef;
  onChange: (graph: AnimStateMachineDef) => void;
}

const FIELD = 'w-full px-2 py-1 rounded-md bg-studio-bg border border-studio-border text-xs text-studio-text focus:outline-none focus:border-studio-accent';
const LABEL = 'text-[10px] uppercase tracking-wide text-studio-muted';
const ICON_BUTTON = 'p-1 rounded-md text-studio-muted hover:text-studio-text hover:bg-studio-bg';

function toNumber(value: string): number | undefined {
  if (value.trim() === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export const StudioAnimationGraphTransitions: React.FC<StudioAnimationGraphTransitionsProps> = ({ graph, onChange }) => {
  const { t } = useI18n();
  const copy = t.animation;
  const parameters = graph.parameters ?? [];
  const stateIds = graph.states.map((state) => state.id);

  const addNewTransition = () => {
    const from = graph.states[0]?.id ?? ANY_STATE;
    const to = graph.states[graph.states.length - 1]?.id ?? from;
    onChange(addTransition(graph, { from, to, duration: 0.2, conditions: [] }));
  };

  return (
    <section className="flex flex-col gap-2" data-testid="animation-graph-transitions">
      <div className="flex items-center justify-between">
        <span className={LABEL}>{copy.graphTransitions}</span>
        <button
          type="button"
          onClick={addNewTransition}
          className={ICON_BUTTON}
          data-testid="animation-graph-add-transition"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>

      {graph.transitions.map((transition, index) => (
        <div
          key={`${transition.from}-${transition.to}-${index}`}
          className="flex flex-col gap-1.5 rounded-lg border border-studio-border bg-studio-bg/40 p-2"
        >
          <div className="grid grid-cols-[1fr_1fr_auto] gap-1.5 items-end">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphFrom}</span>
              <select
                className={FIELD}
                value={transition.from}
                onChange={(event) => onChange(updateTransition(graph, index, { from: event.target.value }))}
              >
                <option value={ANY_STATE}>{copy.graphAnyState}</option>
                {stateIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphTo}</span>
              <select
                className={FIELD}
                value={transition.to}
                onChange={(event) => onChange(updateTransition(graph, index, { to: event.target.value }))}
              >
                {stateIds.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => onChange(removeTransition(graph, index))}
              className={ICON_BUTTON}
              title={copy.graphRemove}
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1.5">
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphDuration}</span>
              <input
                type="number"
                step="0.05"
                min="0"
                className={FIELD}
                value={transition.duration ?? 0}
                onChange={(event) => onChange(updateTransition(graph, index, { duration: toNumber(event.target.value) ?? 0 }))}
              />
            </label>
            <label className="flex flex-col gap-0.5">
              <span className={LABEL}>{copy.graphExitTime}</span>
              <input
                type="number"
                step="0.05"
                min="0"
                max="1"
                className={FIELD}
                value={transition.exitTime ?? ''}
                onChange={(event) => onChange(updateTransition(graph, index, { exitTime: toNumber(event.target.value) }))}
              />
            </label>
          </div>

          <div className="flex flex-col gap-1">
            {(transition.conditions ?? []).map((condition, conditionIndex) => (
              <div key={`${condition.parameter}-${conditionIndex}`} className="grid grid-cols-[1fr_auto_auto] gap-1.5 items-end">
                <label className="flex flex-col gap-0.5">
                  <span className={LABEL}>{copy.graphCondition}</span>
                  <select
                    className={FIELD}
                    value={condition.parameter}
                    onChange={(event) => onChange(updateCondition(graph, index, conditionIndex, { parameter: event.target.value }))}
                  >
                    <option value="">-</option>
                    {parameters.map((parameter) => (
                      <option key={parameter.name} value={parameter.name}>{parameter.name}</option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1 pb-1.5">
                  <input
                    type="checkbox"
                    className="accent-studio-accent"
                    checked={condition.value === true}
                    onChange={(event) => onChange(updateCondition(graph, index, conditionIndex, { value: event.target.checked }))}
                  />
                </label>
                <button
                  type="button"
                  onClick={() => onChange(removeCondition(graph, index, conditionIndex))}
                  className={ICON_BUTTON}
                  title={copy.graphRemove}
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              type="button"
              disabled={parameters.length === 0}
              onClick={() => onChange(addCondition(graph, index, { parameter: parameters[0]?.name ?? '', value: true }))}
              className="self-start text-[11px] text-studio-accent hover:underline disabled:opacity-40"
              data-testid={`animation-graph-add-condition-${index}`}
            >
              + {copy.graphCondition}
            </button>
          </div>
        </div>
      ))}
    </section>
  );
};

export default StudioAnimationGraphTransitions;
