/**
 * РАЗЛОМ · Ввод: клавиатура, мышь, pointer lock.
 */
export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.keys = new Set();
    this.pressed = new Set();      // одноразовые нажатия этого кадра
    this.mouseDX = 0;
    this.mouseDY = 0;
    this.pointerLocked = false;
    this.sensitivity = 1.0;
    this.invertY = false;
    this.enabled = true;

    window.addEventListener('keydown', (e) => {
      if (!this.enabled) return;
      // Не перехватываем служебные сочетания
      if (e.code === 'Tab') e.preventDefault();
      if (e.repeat) return;
      this.keys.add(e.code);
      this.pressed.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());

    document.addEventListener('mousemove', (e) => {
      if (!this.pointerLocked || !this.enabled) return;
      this.mouseDX += e.movementX || 0;
      this.mouseDY += e.movementY || 0;
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
      if (this.onPointerLockChange) this.onPointerLockChange(this.pointerLocked);
    });

    this.canvas.addEventListener('click', () => {
      if (this.onCanvasClick) this.onCanvasClick();
    });
  }

  requestLock() {
    if (document.pointerLockElement !== this.canvas) {
      const p = this.canvas.requestPointerLock({ unadjustedMovement: true });
      if (p && p.catch) p.catch(() => {
        try { this.canvas.requestPointerLock(); } catch (_) { /* ignore */ }
      });
    }
  }

  releaseLock() {
    if (document.pointerLockElement) document.exitPointerLock();
  }

  isDown(code) { return this.keys.has(code); }
  wasPressed(code) { return this.pressed.has(code); }

  /** Забирает накопленное смещение мыши за кадр. */
  consumeMouse() {
    const dx = this.mouseDX;
    const dy = this.mouseDY;
    this.mouseDX = 0;
    this.mouseDY = 0;
    return { dx, dy: this.invertY ? -dy : dy };
  }

  endFrame() {
    this.pressed.clear();
  }
}
