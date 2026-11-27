// The reader's text size (#271): `bible-settings.fontSize` (small | medium |
// large), set on the settings page and in the chapter page's tools. It is ONE
// root scale for the whole site — `html[data-text-size]` sets the root size as a
// percentage in styles.css, and every font size is in rem/em — so the reading
// text, verse numbers, headings and the blocks around them all follow, on every
// page. A percentage, not px, so it multiplies the phone's own text size
// (133–150 %) instead of replacing it.
//
// The layout applies the saved size in <head> before first paint
// (TEXT_SIZE_SNIPPET in layout.tsx); this module keeps it in step when the
// reader changes it, here or in another tab.

const SETTINGS = 'bible-settings';
export const TEXT_SIZES = ['small', 'medium', 'large'];

/** The saved size ('medium' when none). */
export function savedTextSize() {
  try {
    const size = (JSON.parse(localStorage.getItem(SETTINGS) || '{}') || {}).fontSize;
    return TEXT_SIZES.includes(size) ? size : 'medium';
  } catch {
    return 'medium';
  }
}

/** Show `size` on this page. 'medium' is the stylesheet's own size. */
export function applyTextSize(size) {
  const d = document.documentElement;
  if (size === 'small' || size === 'large') d.dataset.textSize = size;
  else delete d.dataset.textSize;
}

/** Follow a change: from this page (`bibel:font-size`) or another tab (storage). */
export function followTextSize() {
  applyTextSize(savedTextSize());
  document.addEventListener('bibel:font-size', (e) => applyTextSize(e.detail));
  window.addEventListener('storage', (e) => {
    if (e.key === SETTINGS || e.key === null) applyTextSize(savedTextSize());
  });
}
