import { Hono } from 'hono';
import {
  getAllPersonsData,
  getPersonData,
  getPersonsByEra,
  getPersonsByRole,
} from '../../lib/bible.ts';
import { PERSON_ID_ALIASES } from '../../lib/person-id-aliases.ts';
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

  // Rettede id-er 301-er, akkurat som `/personer/:personId` gjør (#61).
  // Kartet lå bare på sida, så samme adresse fikk to svar fra samme app: en
  // leser ble sendt videre, en klient som hentet den over API-et fikk 404. Det
  // er symptomet saken er meldt på — API-et 404-er en id appen selv honorerer.
  //
  // Oppslaget kommer FØRST av samme grunn som på sida: en gammel id finnes
  // ikke i basen lenger, så uten dette faller den rett til 404.
  const alias = PERSON_ID_ALIASES[requested];
  if (alias) {
    // Queryen bæres over — `?lang=` avgjør språket svaret kommer på (#24), og
    // en redirect som mistet den ville sendt klienten til gulvspråket.
    const query = new URL(c.req.url).search;
    return c.redirect(`/api/persons/${alias}${query}`, 301);
  }

  try {
    const person = await getPersonData(requested);
    if (!person) return c.json({ error: 'Person not found' }, 404);
    return c.json(person, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching person:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
