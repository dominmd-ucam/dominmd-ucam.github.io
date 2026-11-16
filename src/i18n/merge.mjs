// Mezcla profunda en el sitio: los objetos se mezclan por clave y las listas por posición, así un fichero de traducción
// solo necesita los campos de texto. Se usa en el navegador (src/i18n/index.ts) y al compilar (scripts/render-classic.mjs).
export function deepMerge(base, over) {
  if (!over || typeof over !== 'object') return base;
  for (const k of Object.keys(over)) {
    const v = over[k];
    if (v && typeof v === 'object' && base[k] && typeof base[k] === 'object') deepMerge(base[k], v);
    else if (v !== null && v !== undefined) base[k] = v;
  }
  return base;
}
