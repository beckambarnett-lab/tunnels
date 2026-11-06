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
    el.addEventListener('mousedown', (e) => {
      if (!this.locked) {
        el.requestPointerLock?.();
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
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === el;
      if (!this.locked) {
        this.mouse.left = this.mouse.right = false;
      }
    });
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
