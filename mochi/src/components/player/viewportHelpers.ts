// Small viewport helpers: input status text and fullscreen toggling.
// Kept out of PlayerViewport so the component stays within the SRP line ceiling.

import { NormalizedInputState } from '../../engine/inputController';

export interface InputLabels {
  move: string;
  actionJump: string;
  actionSprint: string;
  actionOrbit: string;
  grounded: string;
  readyInput: string;
}

export function summarizeInput(state: NormalizedInputState, grounded: boolean, labels: InputLabels): string {
  const parts: string[] = [];
  if (state.axes.x !== 0 || state.axes.y !== 0) {
    parts.push(`${labels.move}(${state.axes.x.toFixed(1)}, ${state.axes.y.toFixed(1)})`);
  }
  if (state.actions.jump) parts.push(labels.actionJump);
  if (state.actions.sprint) parts.push(labels.actionSprint);
  if (state.pointer.isDown) parts.push(labels.actionOrbit);
  if (grounded) parts.push(labels.grounded);
  return parts.length > 0 ? parts.join(' + ') : labels.readyInput;
}

export async function toggleFullscreen(element: HTMLElement | null): Promise<void> {
  if (!element) return;
  try {
    if (!document.fullscreenElement) {
      await element.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch {
    // Browsers may reject fullscreen without a user gesture; nothing to recover.
  }
}
