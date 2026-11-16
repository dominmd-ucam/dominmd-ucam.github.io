# Idiomas (español / inglés)

La web tiene dos páginas: `index.html` (español) y `en.html` (inglés). `en.html` se genera al compilar a partir de
`index.html`, así que **no hay que tocarla**. El botón ES/EN de la cabecera cambia de página y recuerda la elección.

## Añadir textos nuevos

| Dónde está el texto | Qué hacer |
| --- | --- |
| Código nuevo (minijuegos, misiones, paneles…) | `import { t } from '../i18n'` y escribe `t('Abrir el cofre', 'Open the chest')`. |
| Texto en español que ya escribe el juego en el DOM (`textContent`, `aria-label`, `title`, `placeholder`) | Añade la frase exacta a `en/ui.json`: `"Abrir el cofre": "Open the chest"`. `dom.ts` la traduce sola. |
| Datos de `src/data/*.json` (perfil, proyectos, diálogo de Misu) | Añade solo los campos de texto a `en/content.json`. Los proyectos van por `id`; las listas se mezclan por posición (`null` deja el original). |
| Texto fijo de la versión clásica | `scripts/render-classic.mjs`, con `t('…', '…')`. |

Notas:
- `lang` dice el idioma actual (`'es'` o `'en'`); `tr('frase')` traduce con el diccionario de `en/ui.json`.
- Los diccionarios solo se descargan en la versión inglesa. Los textos de `src/data` se traducen antes de cargar el juego.
- Los textos pintados dentro de la escena 3D (carteles en texturas) no pasan por el DOM: usa `t()` al crearlos.
- Las pruebas (`tests/smoke.spec.ts`) comprueban que `en.html` sale en inglés.
