/** Iconos facetados (polígonos planos) para el HUD y los logros. */
const svg = (body: string) => `<svg viewBox="0 0 24 24" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  star: svg('<polygon points="12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9" fill="#ffc857"/><polygon points="12,2 15,9 12,12 9,9" fill="#ffd97f"/><polygon points="12,17 18.5,21 16.5,14 12,12" fill="#f0a93a"/>'),
  wave: svg('<polygon points="2,12 7,8 12,12 17,8 22,12 22,17 17,13 12,17 7,13 2,17" fill="#7fe0d6"/><polygon points="2,12 7,8 12,12 7,13 2,17" fill="#1fb5b0"/>'),
  cat: svg('<polygon points="4,3 10,7 14,7 20,3 21,14 12,21 3,14" fill="#2d3748"/><polygon points="4,3 10,7 5,9" fill="#ff9ac1"/><polygon points="20,3 14,7 19,9" fill="#ff9ac1"/><polygon points="8,11 11,12 9,14" fill="#ffc857"/><polygon points="16,11 13,12 15,14" fill="#ffc857"/><polygon points="11,16 13,16 12,17.5" fill="#ff9ac1"/>'),
  key: svg('<polygon points="8,3 14,3 17,7 14,11 8,11 5,7" fill="#ffc857"/><polygon points="11,11 13,11 13,22 11,22" fill="#f0a93a"/><polygon points="13,16 17,16 17,18 13,18" fill="#f0a93a"/><polygon points="8,5 11,5 11,7 8,7" fill="#0f3440" opacity=".4"/>'),
  compass: svg('<polygon points="12,2 20,6 22,14 16,21 8,21 2,14 4,6" fill="#7fe0d6"/><polygon points="12,5 15,12 12,19 9,12" fill="#ff7a59"/><polygon points="12,5 15,12 12,12" fill="#e05a3c"/>'),
  anchor: svg('<polygon points="11,2 13,2 13,6 15,6 15,8 13,8 13,18 18,15 21,17 15,21 9,21 3,17 6,15 11,18 11,8 9,8 9,6 11,6" fill="#0e5e7a"/><polygon points="11,2 13,2 13,6 11,6" fill="#1fb5b0"/>'),
  avatar: svg('<polygon points="12,3 18,6 18,12 12,15 6,12 6,6" fill="#f2e7cf"/><polygon points="4,21 6,15 12,17 18,15 20,21" fill="#ff7a59"/><polygon points="12,17 18,15 20,21 12,21" fill="#e05a3c"/>'),
  sound: svg('<polygon points="3,9 8,9 13,4 13,20 8,15 3,15" fill="#0f3440"/><polygon points="16,8 18,6 21,12 18,18 16,16 18,12" fill="#1fb5b0"/>'),
  muted: svg('<polygon points="3,9 8,9 13,4 13,20 8,15 3,15" fill="#0f3440"/><polygon points="16,9 21,15 19,17 14,11" fill="#e05a3c"/><polygon points="19,9 21,11 16,17 14,15" fill="#e05a3c"/>'),
  pause: svg('<polygon points="6,4 10,3 10,21 6,20" fill="#0f3440"/><polygon points="14,3 18,4 18,20 14,21" fill="#0f3440"/>'),
  project: svg('<polygon points="3,7 12,3 21,7 21,17 12,21 3,17" fill="#7fe0d6"/><polygon points="12,3 21,7 12,11 3,7" fill="#b9f2ea"/><polygon points="12,11 21,7 21,17 12,21" fill="#1fb5b0"/>'),
};
export type IconName = keyof typeof ICONS;
