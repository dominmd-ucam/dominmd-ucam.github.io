export type WebSection =
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

export type DemoSpec = WebDemo | BotDemo | PluginDemo | CliDemo;

/** Lo que devuelve cada demo al montarse: permite limpiar temporizadores al cerrar la ficha. */
export interface DemoHandle { dispose(): void }
