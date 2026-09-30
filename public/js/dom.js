// DOM-hjelpere delt av øyene. Ingen side-effekter ved import.

/** `<tag class="cls">text</tag>`. Teksten settes som textContent, aldri HTML. */
export function el(tag, cls, text) {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
}

/** Escape for verdier som flettes inn i en HTML-streng (tekst og attributt). */
export const esc = (v) => String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
