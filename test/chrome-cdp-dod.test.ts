// En nettleser som er BORTE skal si det, ikke vente (#275).
//
// Bun dreper prosessene en testfil har startet når en test i fila går ut på
// tid — også Chrome fra `beforeAll` («killed 1 dangling process», SIGTERM). Før
// #275 merket ikke `chrome-cdp.ts` det: hvert påfølgende CDP-kall ventet sine
// 30 s og feilet som et navnløst «CDP-tidsavbrudd», så én rød test i
// `tilgjengelighet.test.ts` ble seks, og ingen av de fem siste sa hvorfor.
//
// Testene under har Buns standardtak (5 s). Venter et kall på 30-sekunders-
// timeren i stedet for å avvises, går testen ut på tid — og meldingen de krever
// («Chrome er borte») kan uansett ikke komme fra timeren, som sier
// «CDP-tidsavbrudd». Ingen klokke i påstandene.

import { expect, test } from 'bun:test';
import { Chrome } from './chrome-cdp.ts';

/** Chrome tar SIGTERM pent og avslutter med 0; Bun kan også drepe hardere. */
const BORTE = /Chrome er borte \((signal SIG[A-Z]+|exit-kode \d+)\)/;

test('et kall som VENTER når Chrome blir drept, avvises og sier hvordan den endte', async () => {
  const chrome = await Chrome.launch();
  try {
    const page = await chrome.open('about:blank');
    const henger = page.evaluate(() => new Promise<never>(() => {}));
    process.kill(chrome.pid, 'SIGTERM');
    await expect(henger).rejects.toThrow(BORTE);
  } finally {
    await chrome.close();
  }
});

test('et kall som SENDES etter at Chrome er drept, avvises med samme forklaring', async () => {
  const chrome = await Chrome.launch();
  try {
    const page = await chrome.open('about:blank');
    process.kill(chrome.pid, 'SIGTERM');
    await chrome.exited;
    await expect(page.evaluate(() => 1)).rejects.toThrow(BORTE);
    await expect(chrome.open('about:blank')).rejects.toThrow(/Chrome er borte/);
  } finally {
    await chrome.close();
  }
});
