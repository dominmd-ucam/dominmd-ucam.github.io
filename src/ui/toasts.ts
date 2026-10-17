import type { AchievementDef } from '../achievements';
import { ICONS } from './icons';

/** Avisos de logro: caen desde arriba con una insignia hexagonal que gira y confeti de triángulos. */
export class Toasts {
  private host = document.getElementById('toasts') as HTMLElement;

  show(a: AchievementDef) {
    const wrap = document.createElement('div');
    wrap.className = 'toast-wrap';
    const confetti = Array.from({ length: 10 }, (_, i) => {
      const ang = (i / 10) * Math.PI * 2, d = 90 + (i % 3) * 25;
      const c = ['#ff7a59', '#ffc857', '#1fb5b0', '#7fe0d6'][i % 4];
      return `<i class="cf" style="--dx:${Math.cos(ang) * d}px;--dy:${Math.sin(ang) * d * 0.7 - 20}px;--r:${i * 80}deg;background:${c}"></i>`;
    }).join('');
    wrap.innerHTML = `
      <div class="toast facet">
        <div class="badge"><div class="badge-in">${ICONS[a.icon]}</div></div>
        <div class="t-body"><span class="t-kicker">Logro desbloqueado</span><strong></strong><span class="t-desc"></span></div>
        <span class="xp">+${a.xp} XP</span>
      </div>${confetti}`;
    (wrap.querySelector('strong') as HTMLElement).textContent = a.title;
    (wrap.querySelector('.t-desc') as HTMLElement).textContent = a.desc;
    this.host.append(wrap);
    setTimeout(() => {
      wrap.classList.add('out');
      setTimeout(() => wrap.remove(), 500);
    }, 3800);
  }
}
