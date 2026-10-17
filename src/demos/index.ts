import type { DemoHandle, DemoSpec } from './types';
import { mountWeb } from './web';
import { mountBot } from './bot';
import { mountPlugin } from './plugin';
import { mountCli } from './cli';
import { mountMobile } from './mobile';
import { mountDevice } from './device';

export type { DemoSpec, DemoHandle };

/** Monta el demo adecuado dentro de `host`. Devuelve un manejador para limpiarlo al cerrar. */
export function mountDemo(host: HTMLElement, spec: DemoSpec): DemoHandle {
  switch (spec.type) {
    case 'web': return mountWeb(host, spec);
    case 'bot': return mountBot(host, spec);
    case 'plugin': return mountPlugin(host, spec);
    case 'cli': return mountCli(host, spec);
    case 'mobile': return mountMobile(host, spec);
    case 'device': return mountDevice(host, spec);
  }
}
