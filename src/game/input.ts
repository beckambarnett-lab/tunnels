/**
 * Keyboard + mouse. Normally the mouse is captured (pointer lock). Some browsers and embedded
 * viewers refuse that; then the game runs in free-mouse mode: moving the mouse turns the view,
 * holding the cursor near the left/right edge keeps turning, the arrow keys turn too.
 * Edge-triggered presses are cleared each frame.
 */
export class Input {
  keys = new Set<string>();
  pressed = new Set<string>();
  mouse = { dx: 0, dy: 0, left: false, right: false, wheel: 0 };
  mousePressed = { left: false, right: false };
  /** the mouse is captured by pointer lock */
  captured = false;
  /** playing without capture (the browser refused it) */
  free = false;
  /** the browser has refused capture once: later clicks go straight to free-mouse mode */
  refused = false;
  /** why the last capture failed, shown under "Click to play" */
  lockError = '';
  /** when free-mouse mode last started (the HUD explains it for a few seconds) */
  freeSince = -1e9;
  private unlockedAt = -1e9;
  private cx = -1; // cursor position in free-mouse mode (-1 = outside the window)
  private cy = -1;

  /** input reaches the game (the old meaning of "locked") */
  get locked() {
    return this.captured || this.free;
  }

  constructor(public el: HTMLElement) {
    addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow') || (e.ctrlKey && e.code !== 'KeyR')) e.preventDefault();
      // Esc releases free-mouse mode, as it releases a captured mouse (and isn't also a pause)
      if (e.code === 'Escape' && this.free) {
        this.leaveFree();
        return;
      }
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code));
    addEventListener('blur', () => {
      this.keys.clear();
      this.mouse.left = this.mouse.right = false;
    });
    // a click anywhere on the game starts play (not just the canvas: an overlay must never swallow
    // it), except on real controls (menu, debug panel, error box)
    addEventListener('mousedown', (e) => {
      if (!this.locked) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('button, input, select, textarea, a, #debug-panel, #errors, #menu')) return;
        this.cx = e.clientX;
        this.cy = e.clientY;
        if (this.refused) this.enterFree();
        else this.lock();
        return;
      }
      if (this.free) {
        const t = e.target as HTMLElement | null;
        if (t?.closest?.('button, input, select, textarea, a, #debug-panel, #errors')) return;
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
    addEventListener('contextmenu', (e) => {
      if (this.locked || e.target === el) e.preventDefault();
    });
    addEventListener('mousemove', (e) => {
      if (this.free) {
        this.cx = e.clientX;
        this.cy = e.clientY;
      }
      if (!this.locked) return;
      this.mouse.dx += e.movementX;
      this.mouse.dy += e.movementY;
    });
    document.addEventListener('mouseleave', () => (this.cx = this.cy = -1));
    addEventListener('wheel', (e) => (this.mouse.wheel += Math.sign(e.deltaY)), { passive: true });
    document.addEventListener('pointerlockerror', () => this.refuse('The browser refused to capture the mouse'));
    document.addEventListener('pointerlockchange', () => {
      this.captured = document.pointerLockElement === el;
      if (this.captured) {
        this.lockError = '';
        this.leaveFree();
      } else {
        this.unlockedAt = performance.now();
        this.mouse.left = this.mouse.right = false;
      }
    });
  }

  lock() {
    // Chrome refuses a re-capture within about a second of leaving it with Esc
    if (performance.now() - this.unlockedAt < 1100) {
      this.lockError = 'Wait a moment after Esc, then click again';
      return;
    }
    const req = (this.el as any).requestPointerLock;
    if (!req) return this.refuse('This browser cannot capture the mouse');
    try {
      const r: any = req.call(this.el);
      // newer browsers return a promise that rejects instead of firing pointerlockerror
      if (r && typeof r.catch === 'function') r.catch((err: any) => this.refuse(`Mouse capture failed (${err?.name || err})`));
    } catch (err: any) {
      this.refuse(`Mouse capture failed (${err?.name || err})`);
    }
  }

  /** capture refused: say why, and play on without it */
  private refuse(why: string) {
    if (this.captured) return;
    const embedded = (() => {
      try {
        return window.top !== window.self;
      } catch {
        return true;
      }
    })();
    this.refused = true;
    this.lockError = why + (embedded ? ' (the game is inside another page; opening it in its own browser tab fixes this)' : '');
    this.enterFree();
  }

  private enterFree() {
    if (this.free) return;
    this.free = true;
    this.freeSince = performance.now();
    document.body.classList.add('freemouse');
  }

  private leaveFree() {
    if (!this.free) return;
    this.free = false;
    this.mouse.left = this.mouse.right = false;
    document.body.classList.remove('freemouse');
  }

  /**
   * Per-frame look that doesn't need a captured mouse: arrow keys, and in free-mouse mode the
   * cursor held near an edge keeps turning (so you can turn round without running off the screen).
   */
  tick(dt: number, sens: number) {
    if (!this.locked) return;
    const turn = 2.4 / sens; // ~2.4 rad/s at full rate, in mouse-pixel units
    if (this.keys.has('ArrowLeft')) this.mouse.dx -= turn * dt;
    if (this.keys.has('ArrowRight')) this.mouse.dx += turn * dt;
    if (this.keys.has('ArrowUp')) this.mouse.dy -= turn * 0.5 * dt;
    if (this.keys.has('ArrowDown')) this.mouse.dy += turn * 0.5 * dt;
    if (!this.free || this.cx < 0) return;
    const W = innerWidth, H = innerHeight;
    const mx = W * 0.12, my = H * 0.1;
    const ex = this.cx < mx ? -(1 - this.cx / mx) : this.cx > W - mx ? 1 - (W - this.cx) / mx : 0;
    const ey = this.cy < my ? -(1 - this.cy / my) : this.cy > H - my ? 1 - (H - this.cy) / my : 0;
    this.mouse.dx += Math.sign(ex) * Math.pow(Math.abs(ex), 1.5) * turn * dt;
    this.mouse.dy += Math.sign(ey) * Math.pow(Math.abs(ey), 1.5) * turn * 0.4 * dt;
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
