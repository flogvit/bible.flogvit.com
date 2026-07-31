// Veien tilbake fra /bidra til teksten leseren kom fra (#57).
//
// Siden vet allerede hvilket kapittel den ble åpnet fra — ?vers/?kap/?bok
// brukes til å forhåndsfylle referansefeltet. Vakta her holder på at det
// SAMME opphavet også blir en lenke i brødsmulene, og at en parameter som
// kommer utenfra ikke får bli en død lenke (#46-regelen).
//
// Ingen DB, ingen sesjon: skallet — og dermed brødsmulene — er det samme for
// den som ikke er logget inn, og det er nettopp hun som lettest står fast.

import { describe, expect, test } from 'bun:test';
import { createApp } from '../src/app.ts';
import { L } from './paths.ts';
import { href } from '../src/lib/i18n.ts';

const app = createApp();

async function crumbs(path: string): Promise<{ label: string; href: string | null }[]> {
  const res = await app.request(path);
  expect(res.status).toBe(200);
  const html = await res.text();
  const nav = html.match(/<nav class="breadcrumbs"[\s\S]*?<\/nav>/)?.[0];
  expect(nav).toBeString();
  return [...nav!.matchAll(/<li>([\s\S]*?)<\/li>/g)].map((m) => {
    const item = m[1]!;
    const link = item.match(/<a href="([^"]+)"/);
    return {
      label: item.replace(/<[^>]*>/g, '').trim(),
      href: link ? link[1]! : null,
    };
  });
}

describe('/bidra — brødsmulene bærer opphavet', () => {
  test('uten parameter: Hjem → Bidra, ingen kapittelledd', async () => {
    const items = await crumbs(L('/bidra'));
    expect(items).toHaveLength(2);
    expect(items[0]!.href).toBe(L('/'));
    expect(items[1]!.href).toBeNull();
  });

  test('?kap gir et ledd tilbake til kapittelet', async () => {
    const items = await crumbs(L('/bidra?kap=1mos-1'));
    expect(items).toHaveLength(3);
    expect(items[1]!.href).toBe(L('/1mos/1'));
    expect(items[1]!.label).toBe('Gen 1');
    // «Bidra» står fortsatt sist, og uten lenke.
    expect(items[2]!.href).toBeNull();
  });

  test('?vers lander på verset, ikke bare på kapittelet', async () => {
    const items = await crumbs(L('/bidra?vers=1mos-1-3'));
    expect(items).toHaveLength(3);
    expect(items[1]!.href).toBe(`${L('/1mos/1')}#v3`);
    expect(items[1]!.label).toBe('Gen 1:3');
  });

  test('?bok gir et ledd tilbake til boka', async () => {
    const items = await crumbs(L('/bidra?bok=matt'));
    expect(items).toHaveLength(3);
    expect(items[1]!.href).toBe(L('/matt/1'));
    expect(items[1]!.label).toBe('Matthew');
  });

  test('leddet er prefikset med locale-en leseren står i', async () => {
    const items = await crumbs(href('nb', '/bidra?kap=1mos-1'));
    expect(items[1]!.href).toBe('/nb/1mos/1');
    expect(items[1]!.label).toBe('1Mos 1');
  });

  // #46: en adresse utenfra får ikke peke på et kapittel som ikke finnes.
  test('kapittel utenfor bokas antall gir ingen lenke', async () => {
    expect(await crumbs(L('/bidra?kap=1mos-51'))).toHaveLength(2);
    expect(await crumbs(L('/bidra?vers=1mos-51-1'))).toHaveLength(2);
  });

  test('ukjent bok, søppel og tomme verdier gir ingen lenke', async () => {
    for (const q of ['kap=tullebok-1', 'kap=1mos-0', 'kap=1mos-x', 'kap=1mos', 'kap=', 'bok=tullebok']) {
      expect(await crumbs(L(`/bidra?${q}`))).toHaveLength(2);
    }
  });

  // Kapittelet finnes, bare ankeret gjør ikke — da er kapittelet fortsatt en
  // sann vei tilbake, og etiketten skal ikke navngi et vers som ikke finnes.
  test('vers forbi kapittelslutten faller tilbake til kapittelet', async () => {
    const items = await crumbs(L('/bidra?vers=1mos-1-32')); // 1 Mos 1 har 31 vers
    expect(items).toHaveLength(3);
    expect(items[1]!.href).toBe(L('/1mos/1'));
    expect(items[1]!.label).toBe('Gen 1');
    expect((await crumbs(L('/bidra?vers=1mos-1-31')))[1]!.href).toBe(`${L('/1mos/1')}#v31`);
  });

  test('parameteren rendres aldri rått inn i markupen', async () => {
    const res = await app.request(L('/bidra?kap=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E-1'));
    expect(await res.text()).not.toContain('<script>alert(1)</script>');
  });
});
