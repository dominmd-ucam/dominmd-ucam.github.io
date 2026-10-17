export interface AchievementDef { id: string; title: string; desc: string; xp: number; icon: 'star' | 'wave' | 'cat' | 'key' | 'compass' | 'anchor' }

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'steps', title: 'Primeros pasos', desc: 'Recorre la isla a pie', xp: 10, icon: 'compass' },
  { id: 'friend', title: 'Amigo felino', desc: 'Habla con Misu', xp: 20, icon: 'cat' },
  { id: 'curious', title: 'Curioso', desc: 'Abre tu primer proyecto', xp: 30, icon: 'key' },
  { id: 'explorer', title: 'Explorador', desc: 'Abre los cuatro proyectos', xp: 100, icon: 'star' },
  { id: 'swimmer', title: 'Nadador', desc: 'Date un baño en el mar', xp: 20, icon: 'wave' },
  { id: 'sailor', title: 'Lobo de mar', desc: 'Llega al final del muelle', xp: 25, icon: 'anchor' },
  { id: 'wreck', title: 'Cazatesoros', desc: 'Visita el barco varado', xp: 25, icon: 'anchor' },
  { id: 'cave', title: 'Espeleólogo', desc: 'Encuentra la cueva y la espada', xp: 25, icon: 'compass' },
  { id: 'lighthouse', title: 'Guardafaro', desc: 'Sube al faro', xp: 25, icon: 'star' },
  { id: 'islet', title: 'Robinson', desc: 'Llega nadando al islote', xp: 40, icon: 'wave' },
];

const KEY = 'portfolio-achievements-v1';

export class Achievements {
  private done = new Set<string>();
  opened = new Set<string>();
  onUnlock: (a: AchievementDef) => void = () => {};

  constructor() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}') as { done?: string[]; opened?: string[] };
      raw.done?.forEach((d) => this.done.add(d));
      raw.opened?.forEach((d) => this.opened.add(d));
    } catch { /* sin almacenamiento */ }
  }

  has(id: string) { return this.done.has(id); }
  get count() { return this.done.size; }
  get xp() { return ACHIEVEMENTS.filter((a) => this.done.has(a.id)).reduce((s, a) => s + a.xp, 0); }

  unlock(id: string) {
    if (this.done.has(id)) return;
    const def = ACHIEVEMENTS.find((a) => a.id === id);
    if (!def) return;
    this.done.add(id);
    this.save();
    this.onUnlock(def);
  }

  markOpened(projectId: string, total: number) {
    this.opened.add(projectId);
    this.save();
    this.unlock('curious');
    if (this.opened.size >= total) this.unlock('explorer');
  }

  private save() {
    try { localStorage.setItem(KEY, JSON.stringify({ done: [...this.done], opened: [...this.opened] })); } catch { /* ignorar */ }
  }
}
