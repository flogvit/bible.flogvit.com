// Historier som fikk ny slug i korrekturen 301-er fra den gamle adressen (#153).
//
// Fire halvdeler:
//   KARTET   — hver måladresse er en historie som finnes, og ingen gammel slug
//              er en levende historie (ellers ville redirecten tatt den fra
//              leseren). Målt mot BASEN, på alle innholdsspråk den har.
//   FLATA    — sida og API-et: hver gammel slug 301-er på alle åtte prefikser,
//              og måladressen svarer selv 200 — en 301 til en 404 er ingen fiks.
//   QUERYEN  — bæres over redirecten (#24), ellers svarer neste side på noe
//              annet enn det leseren ba om.
//   GJETTER ALDRI — en slug som ikke står i kartet er fortsatt 404, ellers ville
//              «301 på alt som ikke finnes» bestått.

import { describe, expect, setDefaultTimeout, test } from 'bun:test';
import { DB_TEST_TIMEOUT_MS } from './db-timeout.ts';
import { createApp } from '../src/app.ts';
import { getSql } from '../src/lib/db.ts';
import { STORY_SLUG_ALIASES } from '../src/lib/story-slug-aliases.ts';
import { href, LOCALES } from '../src/lib/i18n.ts';

setDefaultTimeout(DB_TEST_TIMEOUT_MS);

const app = createApp();
const ENTRIES = Object.entries(STORY_SLUG_ALIASES);

describe('historie-slug-aliaser — kartet', () => {
  test('kartet bærer sakens eget bevis', () => {
    expect(STORY_SLUG_ALIASES['pasken-og-uttogget']).toBe('pasken-og-uttoget');
    expect(STORY_SLUG_ALIASES['engelen-gabriel-besok-maria']).toBe('engelen-gabriel-besoker-maria');
    expect(STORY_SLUG_ALIASES['daniel-og-nebukadnesars-drom']).toBe('daniel-tyder-nebukadnesars-drom');
  });

  test('ingen kjede og ingen selvreferanse', () => {
    expect(ENTRIES.filter(([k, v]) => k === v || v in STORY_SLUG_ALIASES)).toEqual([]);
  });

  test('hver måladresse finnes, og ingen gammel slug er en levende historie — på hvert språk', async () => {
    const rows = (await getSql()`SELECT slug, language FROM stories`) as { slug: string; language: string }[];
    const byLang = new Map<string, Set<string>>();
    for (const r of rows) {
      if (!byLang.has(r.language)) byLang.set(r.language, new Set());
      byLang.get(r.language)!.add(r.slug);
    }
    expect(byLang.size).toBeGreaterThan(0);
    const problems: string[] = [];
    for (const [lang, slugs] of byLang) {
      for (const [old, next] of ENTRIES) {
        if (!slugs.has(next)) problems.push(`${lang}: mål ${next} finnes ikke`);
        if (slugs.has(old)) problems.push(`${lang}: ${old} er en levende historie`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('historie-slug-aliaser — flata', () => {
  test('hver gammel slug 301-er til den nye på alle åtte prefikser, og målet svarer 200', async () => {
    const problems: string[] = [];
    for (const locale of LOCALES) {
      for (const [old, next] of ENTRIES) {
        const res = await app.request(href(locale, `/historier/${old}`));
        const want = href(locale, `/historier/${next}`);
        if (res.status !== 301 || res.headers.get('location') !== want) {
          problems.push(`${locale}/${old}: ${res.status} → ${res.headers.get('location')}`);
          continue;
        }
        const target = await app.request(want);
        if (target.status !== 200) problems.push(`${want}: ${target.status}`);
      }
    }
    expect(problems).toEqual([]);
  });

  test('API-et gir samme svar som sida', async () => {
    const problems: string[] = [];
    for (const [old, next] of ENTRIES) {
      const res = await app.request(`/api/stories/${old}`);
      if (res.status !== 301 || res.headers.get('location') !== `/api/stories/${next}`) {
        problems.push(`${old}: ${res.status} → ${res.headers.get('location')}`);
        continue;
      }
      const target = await app.request(`/api/stories/${next}`);
      if (target.status !== 200) problems.push(`/api/stories/${next}: ${target.status}`);
    }
    expect(problems).toEqual([]);
  });

  test('queryen bæres over', async () => {
    const page = await app.request(href('en', '/historier/pasken-og-uttogget') + '?bible=osnn');
    expect(page.headers.get('location')).toBe(href('en', '/historier/pasken-og-uttoget') + '?bible=osnn');
    const api = await app.request('/api/stories/pasken-og-uttogget?lang=en');
    expect(api.headers.get('location')).toBe('/api/stories/pasken-og-uttoget?lang=en');
  });

  test('gjetter aldri: en slug utenfor kartet er fortsatt 404', async () => {
    expect((await app.request(href('en', '/historier/samuelsdommen-over-israel'))).status).toBe(404);
    expect((await app.request('/api/stories/samuelsdommen-over-israel')).status).toBe(404);
  });
});
