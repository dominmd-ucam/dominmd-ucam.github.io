/** Teclado, ratón y joystick táctil → un único estado de entrada. */
export class Input {
  move = { x: 0, y: 0 }; // x derecha, y adelante
  yaw = 0.6;
  pitch = 0.5;
  dist = 10;
  enabled = true;
  /** se pulsó saltar (lo consume el jugador) */
  jump = false;
  /** agachado (C o Ctrl alterna; en móvil, su botón) */
  crouch = false;
  /** Mayús: esprint */
  sprint = false;
  /** se pidió una voltereta (agacharse mientras esprintas) */
  roll = false;
  onInteract: () => void = () => {};
  onEscape: () => void = () => {};

  private keys = new Set<string>();
  private stick = { id: -1, ox: 0, oy: 0, x: 0, y: 0, over: 0 };
  private look = { id: -1, x: 0, y: 0 };
  private joy = document.getElementById('joy') as HTMLElement;
  private joyKnob = this.joy.querySelector('i') as HTMLElement;

  constructor(canvas: HTMLCanvasElement) {
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      const k = e.key.toLowerCase();
      if (k === 'escape') this.onEscape();
      if (!this.enabled) return;
      this.keys.add(k);
      if (k === 'e' || k === 'enter') this.onInteract();
      if (k === ' ') { this.jump = true; e.preventDefault(); }
      if (k === 'c' || k === 'control') this.toggleCrouch();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    // botones táctiles de saltar y agacharse
    const press = (id: string, fn: () => void) => document.getElementById(id)?.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      if (this.enabled) fn();
    });
    press('jumpBtn', () => { this.jump = true; });
    press('crouchBtn', () => this.toggleCrouch());

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      canvas.setPointerCapture(e.pointerId);
      if (e.pointerType === 'touch' && e.clientX < innerWidth * 0.45 && this.stick.id < 0) {
        Object.assign(this.stick, { id: e.pointerId, ox: e.clientX, oy: e.clientY, x: 0, y: 0 });
        this.joy.hidden = false;
        this.joy.style.left = `${e.clientX}px`; this.joy.style.top = `${e.clientY}px`;
        this.joyKnob.style.transform = 'translate(-50%,-50%)';
      } else if (this.look.id < 0) {
        Object.assign(this.look, { id: e.pointerId, x: e.clientX, y: e.clientY });
      }
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId === this.stick.id) {
        const dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
        const len = Math.hypot(dx, dy), max = 48, k = len > max ? max / len : 1;
        this.stick.x = (dx * k) / max; this.stick.y = (dy * k) / max; this.stick.over = len / max;
        this.joy.classList.toggle('sprint', this.stick.over > 1.5);
        this.joyKnob.style.transform = `translate(calc(-50% + ${dx * k}px), calc(-50% + ${dy * k}px))`;
      } else if (e.pointerId === this.look.id) {
        this.yaw -= (e.clientX - this.look.x) * 0.0055;
        this.pitch = clamp(this.pitch + (e.clientY - this.look.y) * 0.004, 0.08, 1.3);
        this.look.x = e.clientX; this.look.y = e.clientY;
      }
    });
    const up = (e: PointerEvent) => {
      if (e.pointerId === this.stick.id) { this.stick.id = -1; this.stick.x = this.stick.y = this.stick.over = 0; this.joy.hidden = true; }
      if (e.pointerId === this.look.id) this.look.id = -1;
    };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.dist = clamp(this.dist * (1 + Math.sign(e.deltaY) * 0.08), 3, 20);
    }, { passive: false });
  }

  private toggleCrouch() {
    // agacharse corriendo a toda velocidad es una voltereta
    if (!this.crouch && this.sprintHeld()) { this.roll = true; return; }
    this.crouch = !this.crouch;
    document.getElementById('crouchBtn')?.classList.toggle('on', this.crouch);
  }

  private sprintHeld() { return this.keys.has('shift') || (this.stick.id >= 0 && this.stick.over > 1.5); }

  update() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.keys.has('w') || this.keys.has('arrowup')) y += 1;
      if (this.keys.has('s') || this.keys.has('arrowdown')) y -= 1;
      if (this.keys.has('d') || this.keys.has('arrowright')) x += 1;
      if (this.keys.has('a') || this.keys.has('arrowleft')) x -= 1;
      x += this.stick.x; y -= this.stick.y;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
      if (len < 0.12) { x = 0; y = 0; }
    }
    this.move.x = x; this.move.y = y;
    this.sprint = this.enabled && this.sprintHeld() && !this.crouch;
  }
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
