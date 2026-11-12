// Unified Input Controller for Keyboard, Pointer, Touch, and Gamepad

export interface NormalizedInputState {
  axes: {
    x: number;
    y: number;
  };
  actions: {
    jump: boolean;
    sprint: boolean;
    pause: boolean;
  };
  pointer: {
    isDown: boolean;
    x: number;
    y: number;
    dx: number;
    dy: number;
  };
}

export class InputController {
  private activeKeys = new Set<string>();
  private pointerDown = false;
  private pointerX = 0;
  private pointerY = 0;
  private pointerDeltaX = 0;
  private pointerDeltaY = 0;
  private targetElement: HTMLElement | Window | null = null;
  private isAttached = false;

  // Virtual touch controls
  private virtualJoystickX = 0;
  private virtualJoystickY = 0;
  private virtualJump = false;
  private virtualSprint = false;

  private onKeyDown = (e: KeyboardEvent) => {
    this.activeKeys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.activeKeys.delete(e.code);
  };

  private onPointerDown = (e: PointerEvent) => {
    this.pointerDown = true;
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
  };

  private onPointerMove = (e: PointerEvent) => {
    if (this.pointerDown) {
      this.pointerDeltaX += e.movementX ?? (e.clientX - this.pointerX);
      this.pointerDeltaY += e.movementY ?? (e.clientY - this.pointerY);
    }
    this.pointerX = e.clientX;
    this.pointerY = e.clientY;
  };

  private onPointerUp = () => {
    this.pointerDown = false;
  };

  private onTouchStart = (e: TouchEvent) => {
    if (e.touches.length > 0) {
      this.pointerDown = true;
      const touch = e.touches[0];
      this.pointerX = touch.clientX;
      this.pointerY = touch.clientY;
      this.pointerDeltaX = 0;
      this.pointerDeltaY = 0;
    }
  };

  private onTouchMove = (e: TouchEvent) => {
    if (this.pointerDown && e.touches.length > 0) {
      const touch = e.touches[0];
      this.pointerDeltaX += touch.clientX - this.pointerX;
      this.pointerDeltaY += touch.clientY - this.pointerY;
      this.pointerX = touch.clientX;
      this.pointerY = touch.clientY;
    }
  };

  private onTouchEnd = () => {
    this.pointerDown = false;
  };

  public attach(element: HTMLElement | Window = window): void {
    if (this.isAttached) return;
    this.targetElement = element;
    this.isAttached = true;

    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);

    if (element && 'addEventListener' in element) {
      element.addEventListener('pointerdown', this.onPointerDown as EventListener);
      element.addEventListener('pointermove', this.onPointerMove as EventListener);
      element.addEventListener('pointerup', this.onPointerUp as EventListener);
      element.addEventListener('touchstart', this.onTouchStart as EventListener, { passive: true });
      element.addEventListener('touchmove', this.onTouchMove as EventListener, { passive: true });
      element.addEventListener('touchend', this.onTouchEnd as EventListener);
    }
  }

  public detach(): void {
    if (!this.isAttached) return;
    this.isAttached = false;

    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);

    if (this.targetElement && 'removeEventListener' in this.targetElement) {
      this.targetElement.removeEventListener('pointerdown', this.onPointerDown as EventListener);
      this.targetElement.removeEventListener('pointermove', this.onPointerMove as EventListener);
      this.targetElement.removeEventListener('pointerup', this.onPointerUp as EventListener);
      this.targetElement.removeEventListener('touchstart', this.onTouchStart as EventListener);
      this.targetElement.removeEventListener('touchmove', this.onTouchMove as EventListener);
      this.targetElement.removeEventListener('touchend', this.onTouchEnd as EventListener);
    }

    this.activeKeys.clear();
    this.pointerDown = false;
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;
    this.resetVirtualControls();
  }

  public setVirtualJoystick(x: number, y: number): void {
    this.virtualJoystickX = Math.max(-1, Math.min(1, x));
    this.virtualJoystickY = Math.max(-1, Math.min(1, y));
  }

  public setVirtualAction(action: 'jump' | 'sprint' | 'pause', active: boolean): void {
    if (action === 'jump') this.virtualJump = active;
    if (action === 'sprint') this.virtualSprint = active;
  }

  public resetVirtualControls(): void {
    this.virtualJoystickX = 0;
    this.virtualJoystickY = 0;
    this.virtualJump = false;
    this.virtualSprint = false;
  }

  public poll(): NormalizedInputState {
    let axisX = 0;
    let axisY = 0;

    // Keyboard WASD & Arrow keys
    if (this.activeKeys.has('KeyA') || this.activeKeys.has('ArrowLeft')) axisX -= 1;
    if (this.activeKeys.has('KeyD') || this.activeKeys.has('ArrowRight')) axisX += 1;
    if (this.activeKeys.has('KeyW') || this.activeKeys.has('ArrowUp')) axisY += 1;
    if (this.activeKeys.has('KeyS') || this.activeKeys.has('ArrowDown')) axisY -= 1;

    // Combine virtual touch joystick input
    axisX += this.virtualJoystickX;
    axisY += this.virtualJoystickY;

    let jump = this.activeKeys.has('Space') || this.virtualJump;
    let sprint = this.activeKeys.has('ShiftLeft') || this.activeKeys.has('ShiftRight') || this.virtualSprint;
    let pause = this.activeKeys.has('Escape');

    // Gamepad API integration
    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      try {
        const gamepads = navigator.getGamepads();
        for (let i = 0; i < gamepads.length; i++) {
          const pad = gamepads[i];
          if (!pad || !pad.connected) continue;

          // Standard mapping: axes 0/1 are left stick
          if (pad.axes.length >= 2) {
            const padX = pad.axes[0];
            const padY = -pad.axes[1]; // Invert Y for forward = +1
            const deadzone = 0.15;
            if (Math.abs(padX) > deadzone) axisX += padX;
            if (Math.abs(padY) > deadzone) axisY += padY;
          }

          // Button 0 = A / Cross (jump), Button 1 = B / Circle, Button 9 = Start (pause)
          if (pad.buttons.length > 0 && pad.buttons[0]?.pressed) jump = true;
          if (pad.buttons.length > 10 && pad.buttons[10]?.pressed) sprint = true;
          if (pad.buttons.length > 9 && pad.buttons[9]?.pressed) pause = true;
        }
      } catch {
        // Gamepad API access guard
      }
    }

    // Clamp axes to [-1, 1]
    const clampedX = Math.max(-1, Math.min(1, axisX));
    const clampedY = Math.max(-1, Math.min(1, axisY));

    const dx = this.pointerDeltaX;
    const dy = this.pointerDeltaY;
    // Reset delta after consumption
    this.pointerDeltaX = 0;
    this.pointerDeltaY = 0;

    return {
      axes: { x: clampedX, y: clampedY },
      actions: { jump, sprint, pause },
      pointer: {
        isDown: this.pointerDown,
        x: this.pointerX,
        y: this.pointerY,
        dx,
        dy
      }
    };
  }
}

export const defaultInputController = new InputController();
