export type WebSection =
  | { kind: 'chat'; title: string; intro: string; qa: { q: string; a: string }[] }
  | { kind: 'form'; title: string; fields: { label: string; value: string }[]; button: string; resultTitle: string; columns: string[]; rows: string[][] }
  | { kind: 'pixelart'; title: string; hint?: string }
  | { kind: 'feed'; title: string; items: { title: string; text: string; tag?: string }[] }
  | { kind: 'status'; title: string; items: { name: string; detail: string; state: 'ok' | 'warn' | 'down' }[]; incidentLabel?: string }
  | { kind: 'board'; title: string; columns: string[]; cards: { text: string; col: number; meta?: string }[] }
  | { kind: 'hero'; title: string; text: string; cta?: string }
  | { kind: 'cards'; items: { title: string; text: string; price: string }[] }
  | { kind: 'stats'; items: { label: string; value: string }[] }
  | { kind: 'chart'; title: string; values: number[]; labels: string[] }
  | { kind: 'list'; title: string; items: { label: string; value: string }[] };

export interface WebDemo {
  type: 'web';
  url: string;
  cartLabel?: string;
  pages: { title: string; slug: string; sections: WebSection[] }[];
}

export interface BotReply { text?: string; title?: string; fields?: { name: string; value: string }[] }
export interface BotDemo {
  type: 'bot';
  name: string;
  channel: string;
  intro: string[];
  fallback: string;
  commands: { cmd: string; replies: BotReply[] }[];
}

export type PluginSetting =
  | { id: string; label: string; kind: 'toggle'; value: boolean; log: string }
  | { id: string; label: string; kind: 'select'; options: string[]; value: string; log: string }
  | { id: string; label: string; kind: 'number'; min: number; max: number; step: number; value: number; log: string };
export interface PluginDemo {
  type: 'plugin';
  host: string;
  plugin: string;
  sections: { name: string; settings: PluginSetting[] }[];
  commands: { cmd: string; output: string[] }[];
  boot: string[];
}

export interface CliDemo {
  type: 'cli';
  prompt: string;
  banner: string[];
  commands: Record<string, string[]>;
  autoplay: string[];
}

export type MobileTab =
  | { kind: 'swipe'; name: string; icon: string; cards: { name: string; bio: string; tags: string[]; match?: boolean }[] }
  | { kind: 'list'; name: string; icon: string; title: string; items: { title: string; sub: string; tag?: string }[] }
  | { kind: 'chat'; name: string; icon: string; with: string; messages: { from: 'me' | 'them'; text: string }[]; replies: string[] };
export interface MobileDemo { type: 'mobile'; app: string; tabs: MobileTab[] }

export type DeviceScreen =
  | { kind: 'usage'; title: string; meters: { label: string; value: number; note: string }[] }
  | { kind: 'clock'; title: string; city: string; temp: string; desc: string; timezone: string }
  | { kind: 'status'; title: string; items: { name: string; state: 'ok' | 'warn' | 'down' }[] }
  | { kind: 'mascot'; title: string; line: string };
export interface DeviceDemo { type: 'device'; name: string; credit?: string; screens: DeviceScreen[] }

export type DemoSpec = WebDemo | BotDemo | PluginDemo | CliDemo | MobileDemo | DeviceDemo;

/** Lo que devuelve cada demo al montarse: permite limpiar temporizadores al cerrar la ficha. */
export interface DemoHandle { dispose(): void }
