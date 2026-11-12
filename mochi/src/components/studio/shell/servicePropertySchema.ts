// Declarative property schema for the default services. Only real engine state is
// exposed: Lighting drives the sun/clock, Sky drives the skybox asset, and
// Atmosphere drives the fog volume, so every row writes through to the viewport.

import type { EnvironmentState } from '@/engine/environment/environmentTypes';
import { getSkyboxPreset } from '@/engine/environment/skyboxPresets';
import {
  clockTimeFromEnvironment,
  dayPartLabel,
  environmentPatchForClockTime,
  formatClockTime
} from '@/engine/environment/timeOfDay';
import { getStudioService, type StudioServiceId } from '@/engine/studio/services';
import type { StudioObject } from '@/engine/studio/types';
import type { PropertyGroupDef } from './propertyControls';

export interface ServicePropertyContext {
  environment: EnvironmentState;
  onEnvironmentChange: (patch: Partial<EnvironmentState>) => void;
  objects: StudioObject[];
  playerCount?: number;
}

function infoGroups(serviceId: StudioServiceId, ctx: ServicePropertyContext): PropertyGroupDef[] {
  const service = getStudioService(serviceId);
  if (!service) return [];
  const rows = [
    { key: 'className', label: 'ClassName', control: { type: 'readonly' as const, value: service.className } },
    { key: 'summary', label: 'Description', control: { type: 'readonly' as const, value: service.summary } }
  ];
  if (serviceId === 'workspace') {
    rows.push({
      key: 'parts',
      label: 'Parts',
      control: { type: 'readonly' as const, value: String(ctx.objects.length) }
    });
  }
  if (serviceId === 'players') {
    rows.push({
      key: 'connected',
      label: 'Connected',
      control: { type: 'readonly' as const, value: String(ctx.playerCount ?? 0) }
    });
  }
  return [{ title: 'Information', rows }];
}

export function buildServicePropertyGroups(
  serviceId: StudioServiceId,
  ctx: ServicePropertyContext
): PropertyGroupDef[] {
  const { environment, onEnvironmentChange: change } = ctx;

  if (serviceId === 'lighting') {
    const clock = clockTimeFromEnvironment(environment);
    return [
      {
        title: 'Data',
        rows: [
          {
            key: 'clockTime',
            label: 'ClockTime',
            control: {
              type: 'number',
              value: clock,
              step: 0.25,
              min: 0,
              max: 24,
              suffix: 'h',
              onChange: (hours) => change(environmentPatchForClockTime(hours))
            }
          },
          {
            key: 'timeLabel',
            label: 'Time of Day',
            control: { type: 'readonly', value: `${formatClockTime(clock)} (${dayPartLabel(clock)})` }
          }
        ]
      },
      {
        title: 'Appearance',
        rows: [
          {
            key: 'ambient',
            label: 'Ambient',
            control: {
              type: 'slider',
              value: environment.ambientIntensity,
              min: 0,
              max: 3,
              step: 0.05,
              onChange: (ambientIntensity) => change({ ambientIntensity })
            }
          },
          {
            key: 'exposure',
            label: 'ExposureCompensation',
            control: {
              type: 'slider',
              value: environment.exposure,
              min: 0.2,
              max: 3,
              step: 0.05,
              onChange: (exposure) => change({ exposure })
            }
          }
        ]
      },
      {
        title: 'Sun',
        rows: [
          {
            key: 'sunAzimuth',
            label: 'SunAzimuth',
            control: {
              type: 'number',
              value: environment.sunAzimuth,
              step: 1,
              min: 0,
              max: 360,
              suffix: 'deg',
              onChange: (sunAzimuth) => change({ sunAzimuth })
            }
          },
          {
            key: 'sunElevation',
            label: 'SunElevation',
            control: {
              type: 'number',
              value: environment.sunElevation,
              step: 1,
              min: -10,
              max: 90,
              suffix: 'deg',
              onChange: (sunElevation) => change({ sunElevation })
            }
          }
        ]
      }
    ];
  }

  if (serviceId === 'sky') {
    const preset = getSkyboxPreset(environment.skyboxId);
    return [
      {
        title: 'Skybox',
        rows: [
          {
            key: 'skyboxId',
            label: 'Texture',
            control: {
              type: 'skybox',
              value: environment.skyboxId,
              onChange: (skyboxId) => change({ skyboxId })
            }
          },
          { key: 'skyboxName', label: 'Name', control: { type: 'readonly', value: preset.label } },
          { key: 'skyboxAsset', label: 'Asset', control: { type: 'readonly', value: preset.environment } }
        ]
      },
      {
        title: 'Celestial',
        rows: [
          {
            key: 'sunIntensity',
            label: 'SunIntensity',
            control: { type: 'readonly', value: preset.sunIntensity.toFixed(2) }
          },
          {
            key: 'sunColor',
            label: 'SunColor',
            control: { type: 'readonly', value: preset.sunColor }
          }
        ]
      }
    ];
  }

  if (serviceId === 'atmosphere') {
    return [
      {
        title: 'Data',
        rows: [
          {
            key: 'enabled',
            label: 'Enabled',
            control: {
              type: 'toggle',
              value: environment.fogEnabled,
              onChange: (fogEnabled) => change({ fogEnabled })
            }
          },
          {
            key: 'density',
            label: 'Density',
            control: {
              type: 'slider',
              value: environment.fogDensity,
              min: 0,
              max: 0.05,
              step: 0.001,
              format: (value) => value.toFixed(3),
              onChange: (fogDensity) => change({ fogDensity })
            }
          },
          {
            key: 'color',
            label: 'Color',
            control: {
              type: 'color',
              value: environment.fogColor,
              onChange: (fogColor) => change({ fogColor })
            }
          }
        ]
      }
    ];
  }

  return infoGroups(serviceId, ctx);
}
