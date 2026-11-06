/** Keyboard + mouse + pointer lock. Edge-triggered presses are cleared each frame. */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0 };
  mousePressed = { left: false, right: false };
  locked = false;
  constructor(public el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || (e.ctrlKey && e.code !== 'KeyR')) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    // a click anywhere on the game captures the mouse (not just the canvas: an overlay must never
    // swallow it), except on real controls (menu, debug panel, error box)
    addEventListener('mousedown', (e) => {
      if (!this.locked) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('button, input, select, textarea, a, #debug-panel, #errors, #menu')) return;
        this.lock();
        return;
      }
      if (e.button === 0) {
        this.mouse.left = true;
        this.mousePressed.left = true;
      }
      if (e.button === 2) {
        this.mouse.right = true;
        this.mousePressed.right = true;
      }
    });
    addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouse.left = false;
      if (e.button === 2) this.mouse.right = false;
    });
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    addEventListener('wheel', (e) => (this.mouse.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockerror', () => {
      this.lockError = 'The browser refused to capture the mouse. Click again';
    });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (this.locked) this.lockError = '';
      else this.unlockedAt = performance.now();
      if (!this.locked) {
        this.mouse.left = this.mouse.right = false;
      }
    });
  }
  /** why the last capture failed, shown under "Click to play" */
  lockError = '';
  private unlockedAt = -1e9;
  lock() {
    // Chrome refuses a re-capture within about a second of leaving it with Esc
    if (performance.now() - this.unlockedAt < 1100) {
      this.lockError = 'Wait a moment after Esc, then click again';
      return;
    }
    try {
      const r: any = (this.el as any).requestPointerLock?.();
      if (!(this.el as any).requestPointerLock) this.lockError = 'This browser cannot capture the mouse (use Chrome, Edge or Firefox)';
      // newer browsers return a promise that rejects instead of firing pointerlockerror
      if (r && typeof r.catch === 'function') r.catch((err: any) => (this.lockError = `Mouse capture failed (${err?.name || err}). Click again`));
    } catch (err: any) {
      this.lockError = `Mouse capture failed (${err?.name || err}). Click again`;
    }
  }
  down(code: string) {
    return this.keys.has(code);
  }
  hit(code: string) {
    return this.pressed.has(code);
  }
  endFrame() {
    this.pressed.clear();
    this.mouse.dx = this.mouse.dy = 0;
    this.mouse.wheel = 0;
    this.mousePressed.left = this.mousePressed.right = false;
  }
}
