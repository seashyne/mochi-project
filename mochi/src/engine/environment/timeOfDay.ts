// ClockTime helpers. The editor exposes time of day as an hour value, while the
// environment contract stores a sun azimuth/elevation pair, so both directions
// live here: setting the clock rewrites the sun arc, and the clock is derived
// back from the azimuth so a saved draft always round-trips.

import { clampNumber, type EnvironmentState } from './environmentTypes';

export const MIN_CLOCK_HOURS = 0;
export const MAX_CLOCK_HOURS = 24;
/** Sun arc amplitude in degrees: 06:00 sunrise, 12:00 zenith, 18:00 sunset. */
const SUN_ARC_DEGREES = 80;

export function clockTimeFromEnvironment(
  environment: Pick<EnvironmentState, 'sunAzimuth'>
): number {
  const hours = (clampNumber(environment.sunAzimuth, 0, 360, 0) / 360) * 24;
  return Math.round(hours * 100) / 100;
}

export function environmentPatchForClockTime(
  hours: number
): Pick<EnvironmentState, 'sunAzimuth' | 'sunElevation'> {
  const clamped = clampNumber(hours, MIN_CLOCK_HOURS, MAX_CLOCK_HOURS, 12);
  const arc = Math.sin(((clamped - 6) / 12) * Math.PI) * SUN_ARC_DEGREES;
  return {
    sunAzimuth: Math.round((clamped / 24) * 360 * 100) / 100,
    sunElevation: Math.round(clampNumber(arc, -10, 90, 55) * 100) / 100
  };
}

/** Formats an hour value as a HH:MM:SS clock, wrapping 24 to 00. */
export function formatClockTime(hours: number): string {
  const wrapped = ((hours % 24) + 24) % 24;
  const totalSeconds = Math.round(wrapped * 3600);
  const hh = Math.floor(totalSeconds / 3600) % 24;
  const mm = Math.floor((totalSeconds % 3600) / 60);
  const ss = totalSeconds % 60;
  return [hh, mm, ss].map((part) => String(part).padStart(2, '0')).join(':');
}

/** Human label for the part of day, used by the Lighting header chip. */
export function dayPartLabel(hours: number): string {
  const wrapped = ((hours % 24) + 24) % 24;
  if (wrapped < 5) return 'Night';
  if (wrapped < 8) return 'Dawn';
  if (wrapped < 11) return 'Morning';
  if (wrapped < 15) return 'Midday';
  if (wrapped < 18) return 'Afternoon';
  if (wrapped < 20) return 'Sunset';
  return 'Night';
}
