import { Hono } from 'hono';
import {
  getAllPersonsData,
  getPersonData,
  getPersonsByEra,
  getPersonsByRole,
} from '../../lib/bible.ts';
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
  try {
    const person = await getPersonData(c.req.param('id'));
    if (!person) return c.json({ error: 'Person not found' }, 404);
    return c.json(person, 200, NO_CACHE);
  } catch (error) {
    console.error('Error fetching person:', error);
    return c.json({ error: 'Internal server error' }, 500);
  }
});

export default r;
