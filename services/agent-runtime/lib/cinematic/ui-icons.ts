const paths = {
  play: '<path d="m8 5 11 7-11 7z" fill="currentColor" stroke="none"/>',
  pause: '<rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/><rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none"/>',
  replay: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
  previous: '<path d="M5 5v14m13-14L7 12l11 7z"/>',
  next: '<path d="M19 5v14M6 5l11 7-11 7z"/>',
  step: '<path d="m5 5 10 7-10 7zm14 0v14"/>',
  back: '<path d="m19 5-10 7 10 7zM5 5v14"/>',
  settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3" fill="var(--bg,#08121e)"/><circle cx="15" cy="17" r="3" fill="var(--bg,#08121e)"/>',
  notes: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M14 4v16m3-11h1m-1 4h1"/>',
  fullscreen: '<path d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/>',
  orbit: '<circle cx="12" cy="12" r="3"/><ellipse cx="12" cy="12" rx="10" ry="5" transform="rotate(-35 12 12)"/>',
  camera: '<rect x="3" y="6" width="13" height="12" rx="2"/><path d="m16 10 5-3v10l-5-3"/>',
  layers: '<path d="m12 3 10 5-10 5L2 8zm-9 10 9 5 9-5m-18 5 9 5 9-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};

export type PlayerIcon = keyof typeof paths;
export function playerIcon(name: PlayerIcon) {
  return `<svg data-icon="${name}" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths[name]}</svg>`;
}
export function playerIconButton(id: string, name: PlayerIcon, label: string, attributes = '') {
  return `<button id="${id}" type="button" class="icon-button" aria-label="${label}" title="${label}" data-tooltip="${label}" ${attributes}>${playerIcon(name)}</button>`;
}
