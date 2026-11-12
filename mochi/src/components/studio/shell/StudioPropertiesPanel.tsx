// Properties dock: shows the schema for the selected service or part, with the
// filter box every property grid needs once the schema grows.

import React, { useState } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import type { EnvironmentState } from '@/engine/environment/environmentTypes';
import type { StudioObject } from '@/engine/studio/types';
import { getStudioService, type StudioServiceId } from '@/engine/studio/services';
import { PropertyGroupsView } from './propertyControls';
import { buildServicePropertyGroups } from './servicePropertySchema';
import { StudioObjectProperties } from './StudioObjectProperties';

export interface StudioPropertiesPanelProps {
  selectedObject: StudioObject | null;
  selectedService: StudioServiceId | null;
  selectedCount: number;
  objects: StudioObject[];
  environment: EnvironmentState;
  onEnvironmentChange: (patch: Partial<EnvironmentState>) => void;
  onEnvironmentReset?: () => void;
  onUpdateObject: (id: string, updates: Partial<StudioObject>) => void;
  playerCount?: number;
}

export const StudioPropertiesPanel: React.FC<StudioPropertiesPanelProps> = ({
  selectedObject,
  selectedService,
  selectedCount,
  objects,
  environment,
  onEnvironmentChange,
  onEnvironmentReset,
  onUpdateObject,
  playerCount
}) => {
  const [filter, setFilter] = useState('');
  const service = selectedService ? getStudioService(selectedService) : null;
  const isEnvironmentService =
    selectedService === 'lighting' || selectedService === 'sky' || selectedService === 'atmosphere';

  const title = service
    ? service.className
    : selectedObject
      ? selectedObject.name
      : 'No Selection';

  const subtitle = service
    ? service.name
    : selectedObject
      ? selectedObject.type
      : 'Select a service or part';

  return (
    <div className="flex flex-col min-h-0 h-full bg-studio-panel">
      <div className="flex items-center justify-between px-2 h-6 border-b border-studio-border bg-studio-ribbon shrink-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-studio-muted">Properties</span>
        <SlidersHorizontal className="w-3 h-3 text-studio-muted" />
      </div>
      <div className="flex items-center justify-between px-2 py-1 border-b border-studio-border/60 shrink-0">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold text-studio-text truncate">{title}</div>
          <div className="text-[9px] font-mono text-studio-muted truncate">{subtitle}</div>
        </div>
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Filter"
          className="w-20 shrink-0 px-1.5 py-[2px] rounded-[3px] bg-studio-bg border border-studio-border text-[10px] text-studio-text placeholder:text-studio-muted/70 focus:outline-none focus:border-studio-accent"
        />
      </div>

      <div className="flex-1 overflow-y-auto">
        {isEnvironmentService && onEnvironmentReset && (
          <button
            type="button"
            onClick={onEnvironmentReset}
            className="mx-2 my-1 px-2 py-1 rounded-[3px] border border-studio-border bg-studio-card text-[10px] font-mono text-studio-muted hover:text-studio-text transition-colors"
          >
            Reset to starter environment
          </button>
        )}
        {selectedCount > 1 && (
          <div className="mx-2 my-1 px-2 py-1 rounded-[3px] bg-studio-accent/10 border border-studio-accent/30 text-[10px] font-mono text-studio-accent">
            {selectedCount} parts selected - editing {selectedObject?.name ?? 'the primary part'}
          </div>
        )}

        {service && (
          <PropertyGroupsView
            groups={buildServicePropertyGroups(service.id, {
              environment,
              onEnvironmentChange,
              objects,
              playerCount
            })}
            filter={filter}
          />
        )}

        {!service && selectedObject && (
          <StudioObjectProperties object={selectedObject} onUpdate={onUpdateObject} filter={filter} />
        )}

        {!service && !selectedObject && (
          <div className="p-4 space-y-2 text-center">
            <p className="text-[11px] text-studio-muted">
              Nothing is selected. Pick a service in the Explorer or a part in the viewport.
            </p>
            <p className="text-[10px] font-mono text-studio-muted/70">
              Lighting holds the sun and clock, Sky holds the skybox, Atmosphere holds the fog.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
