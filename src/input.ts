/** Teclado, ratón y joystick táctil → un único estado de entrada. */
import { settings, LOOK_SENS } from './settings';
import { applyDeadzone } from './deadzone';

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
      if (e.repeat || e.isComposing) return;
      // e.code = tecla física: WASD sigue en su sitio con teclados AZERTY (ZQSD) o de otra distribución
      const k = e.code || (e.key === 'Escape' ? 'Escape' : e.key); // algunos teclados virtuales no dan code
      if (k === 'Escape') this.onEscape();
      if (!this.enabled) return;
      this.keys.add(k);
      if (k === 'KeyE' || k === 'Enter' || k === 'NumpadEnter') this.onInteract();
      if (k === 'Space') { this.jump = true; e.preventDefault(); }
      if (k === 'KeyC' || k === 'ControlLeft' || k === 'ControlRight') this.toggleCrouch();
    });
    addEventListener('keyup', (e) => this.keys.delete(e.code || e.key));
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
        const sens = LOOK_SENS[settings.value.lookSens] ?? 1, inv = settings.value.invertY ? -1 : 1;
        this.yaw -= (e.clientX - this.look.x) * 0.0055 * sens;
        this.pitch = clamp(this.pitch + (e.clientY - this.look.y) * 0.004 * sens * inv, 0.08, 1.3);
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

  private sprintHeld() { return this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || (this.stick.id >= 0 && this.stick.over > 1.5); }

  update() {
    let x = 0, y = 0;
    if (this.enabled) {
      if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) y += 1;
      if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) y -= 1;
      if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) x += 1;
      if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) x -= 1;
      x += this.stick.x; y -= this.stick.y;
      const len = Math.hypot(x, y);
      if (len > 1) { x /= len; y /= len; }
    }
    this.move.x = x; this.move.y = y;
    applyDeadzone(this.move);
    this.sprint = this.enabled && this.sprintHeld() && !this.crouch;
  }
}
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
