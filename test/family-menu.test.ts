// FLOGVIT-menyen lister portalens liste, og bare den (#142, flogvit-com#314).
//
// Lista sto skrevet av i layouten her, og i ti andre kodebaser, og ingenting
// sammenlignet dem — så hver flate viste sitt eget utvalg. Fire halvdeler:
// KOPIEN (src/lib/family-menu.json er portalens fil, felt for felt), MENYEN
// (det som rendres er nøyaktig kopien, i rekkefølge, på alle åtte språk),
// FARGENE (prikken bærer kopiens aksent, og CSS-en har ingen egen liste) og
// FORMEN (kopien er gyldig, ellers måler de andre ingenting).
import { describe, expect, test } from 'bun:test';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { FAMILY_MENU, FlogvitMenu, SELF_PRODUCT } from '../src/views/layout.tsx';
import { Hono } from 'hono';
import { contextStorage } from 'hono/context-storage';
import { LOCALES, href, makeT, type Locale } from '../src/lib/i18n.ts';

const ROOT = resolve(import.meta.dir, '..');

/**
 * portal/ ligger ved siden av bibel-utsjekken (flogvit.com/bibel). Et
 * arbeidstre et annet sted (orkesterets `traer/…`) har ingen søsken-portal,
 * så den slås opp ved siden av hovedutsjekken arbeidstreet tilhører — samme
 * oppslag som gallery og dedup bruker for locales.json.
 */
function portalDir(): string | null {
  const beside = resolve(ROOT, '../portal');
  if (existsSync(beside)) return beside;
  const git = Bun.spawnSync(['git', 'rev-parse', '--path-format=absolute', '--git-common-dir'], { cwd: ROOT });
  const commonDir = git.stdout.toString().trim();
  if (!commonDir) return null;
  const viaMain = resolve(dirname(dirname(commonDir)), 'portal');
  return existsSync(viaMain) ? viaMain : null;
}

const PORTAL = portalDir();
const PORTAL_FILE = PORTAL ? resolve(PORTAL, 'design/family-menu.json') : null;
const HAR_PORTALFIL = !!PORTAL_FILE && existsSync(PORTAL_FILE);
const KOPI = JSON.parse(readFileSync(resolve(ROOT, 'src/lib/family-menu.json'), 'utf8'));

describe('KOPIEN er portalens fil', () => {
  test('portal-utsjekken finnes, ellers kan kopien ikke sammenlignes', () => {
    expect(PORTAL).not.toBeNull();
  });

  // Fila skrives i flogvit-com#314. Til den er committet der, er det ingenting
  // å sammenligne med — og det skal SYNES i testutskriften, ikke se grønt ut.
  test.skipIf(!HAR_PORTALFIL)(
    'src/lib/family-menu.json er portal/design/family-menu.json, felt for felt (hoppet over: portalfila finnes ikke ennå — flogvit-com#314)',
    () => {
      const portal = JSON.parse(readFileSync(PORTAL_FILE!, 'utf8'));
      const { _om: _a, ...kopi } = KOPI;
      const { _om: _b, ...fasit } = portal;
      expect(kopi).toEqual(fasit);
    },
  );
});

interface Oppføring {
  tekst: string;
  href: string | null;
  current: boolean;
  soon: boolean;
  dot: string | null;
}

// Menyen rendres inne i en forespørsel med locale satt, slik appen gjør det —
// ellers faller lhref() til basespråket og flatas egen lenke måles ikke.
const meny = new Hono<{ Variables: { locale: Locale } }>();
meny.use(contextStorage());
meny.get('/:locale', (c) => {
  const locale = c.req.param('locale') as Locale;
  c.set('locale', locale);
  return c.html(FlogvitMenu({ t: makeT(locale), locale }));
});

async function rendreMeny(locale: Locale): Promise<Oppføring[]> {
  const html = await (await meny.request(`/${locale}`)).text();
  const panel = /<nav class="fvmenu-panel"[^>]*>([\s\S]*?)<\/nav>/.exec(html)?.[1] ?? '';
  const items = [...panel.matchAll(/<(a|span) class="fvmenu-item([^"]*)"([^>]*)>([\s\S]*?)<\/\1>(?=\s*(?:<a class="fvmenu-item|<span class="fvmenu-item|$))/g)];
  return items.map((m) => {
    const attrs = m[3] ?? '';
    const body = m[4] ?? '';
    return {
      tekst: body.replace(/<span class="fvmenu-chip">[\s\S]*?<\/span>/, '').replace(/<[^>]+>/g, '').trim(),
      href: m[1] === 'a' ? (/href="([^"]*)"/.exec(attrs)?.[1] ?? null) : null,
      current: /aria-current="true"/.test(attrs),
      soon: (m[2] ?? '').includes('soon'),
      dot: /class="fvmenu-dot"[^>]*style="([^"]*)"/.exec(body)?.[1] ?? null,
    };
  });
}

describe('MENYEN lister nøyaktig kopien', () => {
  for (const locale of LOCALES) {
    test(`/${locale}/: FLOGVIT. · produktene i kopiens rekkefølge · konto`, async () => {
      const t = makeT(locale);
      const items = await rendreMeny(locale);
      const forventet: Oppføring[] = [
        { tekst: 'FLOGVIT.', href: FAMILY_MENU.home.href, current: false, soon: false, dot: null },
        ...FAMILY_MENU.products.filter((p: { locales?: string[] }) => !p.locales || p.locales.includes(locale)).map((p) => ({
          tekst: `FLOGVIT.${p.name}`,
          href: p.status === 'coming' ? null : p.name === SELF_PRODUCT ? href(locale, '/') : p.href!,
          current: p.name === SELF_PRODUCT,
          soon: p.status === 'coming',
          dot: `--fv-dot:${p.dot.light};--fv-dot-dark:${p.dot.dark}`,
        })),
        { tekst: t('chrome.accountItem').replace(/&/g, '&amp;'), href: FAMILY_MENU.account.href, current: false, soon: false, dot: null },
      ];
      expect(items).toEqual(forventet);
    });
  }
});

describe('FARGENE kommer fra kopien', () => {
  test('styles.css har ingen egen liste over produktprikker', () => {
    const css = readFileSync(resolve(ROOT, 'public/styles.css'), 'utf8');
    expect(css.match(/\.dot[A-Z]\w*\s*\{[^}]*\}/g) ?? []).toEqual([]);
  });

  test('prikken farges av custom propertyene, i begge moduser', () => {
    const css = readFileSync(resolve(ROOT, 'public/styles.css'), 'utf8');
    expect(css).toMatch(/\.fvmenu-dot\[style\]\s*\{\s*color:\s*var\(--fv-dot\)/);
    expect(css).toMatch(/\[data-fv-theme='dark'\]\s*\.fvmenu-dot\[style\]\s*\{\s*color:\s*var\(--fv-dot-dark\)/);
  });
});

describe('FORMEN på kopien', () => {
  test('har produkter, flata selv står der, og id-ene er unike', () => {
    const ids = FAMILY_MENU.products.map((p) => p.name);
    expect(ids.length).toBeGreaterThan(1);
    expect(ids).toContain(SELF_PRODUCT);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('hver aksent er en hex-farge i begge moduser', () => {
    for (const p of FAMILY_MENU.products) {
      expect(p.dot.light).toMatch(/^#[0-9a-f]{6}$/);
      expect(p.dot.dark).toMatch(/^#[0-9a-f]{6}$/);
      // Et produkt lenker eller er «kommer» — aldri begge, aldri ingen.
      expect(p.status === 'coming').toBe(!p.href);
    }
  });
});

describe('en oppføring med locales vises bare på de språkene (flogvit-com#335)', () => {
  test('menighet står ikke i menyen på nb eller en før eieren sier «Send ut» (flogvit-com-menighet#16)', async () => {
    expect((await rendreMeny('nb')).map((o) => o.tekst)).not.toContain('FLOGVIT.menighet');
    expect((await rendreMeny('en')).map((o) => o.tekst)).not.toContain('FLOGVIT.menighet');
  });
});
