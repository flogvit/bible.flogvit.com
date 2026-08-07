import { Hono } from 'hono';
import {
  getAllPersonsData,
  getPersonByName,
  getPersonData,
  getPersonsByEra,
  getPersonsByRole,
  parsePersonContent,
} from '../../lib/bible.ts';
import { PERSON_ID_ALIASES, normalizedPersonId } from '../../lib/person-id-aliases.ts';
import { resolveId } from '../../lib/canonical-id.ts';
import { NO_CACHE } from './util.ts';

const r = new Hono();

/** GET /api/persons — ?role / ?era som valgfrie filtre. */
r.get('/', async (c) => {
  const role = c.req.query('role');
  const era = c.req.query('era');
  try {
    const persons = role
      ? await getPersonsByRole(role)
      : era
        ? await getPersonsByEra(era)
        : await getAllPersonsData();
    return c.json(persons, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching persons:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

/** GET /api/persons/:id — én person. */
r.get('/:id', async (c) => {
  const requested = c.req.param('id');

  try {
    // Rettede id-er 301-er, akkurat som `/personer/:personId` gjør (#61) — og
    // en skrivemåte basen godtok uten at den ER id-en gjør det samme (#49).
    // Kartet lå bare på sida, så samme adresse fikk to svar fra samme app: en
    // leser ble sendt videre, en klient som hentet den over API-et fikk 404.
    // Samme regel må derfor ligge på begge flatene, ellers er det den defekten
    // gjort på nytt.
    const resolved = await resolveId(requested, {
      aliases: PERSON_ID_ALIASES,
      lookup: (id) => getPersonByName(id),
      idOf: (row) => row.name,
    });
    if (resolved.kind === 'redirect') {
      // Queryen bæres over — `?lang=` avgjør språket svaret kommer på (#24), og
      // en redirect som mistet den ville sendt klienten til gulvspråket.
      const query = new URL(c.req.url).search;
      return c.redirect(`/api/persons/${resolved.to}${query}`, 301);
    }

    const person = resolved.kind === 'found' ? parsePersonContent(resolved.row.content) : null;
    if (!person) {
      // Adressen kan bære et ordrett ø/æ/å der basen har den translittererte
      // id-en (`jisreel-hoseas-sønn` → `jisreel-hoseas-sonn`) — sakens egen
      // overskrift. Kandidaten krever et EKSAKT treff, så vi sender aldri
      // leseren til en 404 og gjetter aldri på hvem hen mente.
      const normalized = normalizedPersonId(requested);
      if (normalized && (await getPersonData(normalized))) {
        const query = new URL(c.req.url).search;
        return c.redirect(`/api/persons/${normalized}${query}`, 301);
      }
      return c.json({ error: 'Person not found' }, 404);
    }
    return c.json(person, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching person:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
