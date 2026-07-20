import { Hono } from 'hono';
import { getSql } from '../../lib/db.ts';

const r = new Hono();

async function metaValue(key: string): Promise<string | undefined> {
  const rows = (await getSql()`
    SELECT value FROM db_meta WHERE \`key\` = ${key}
  `) as { value: string }[];
  return rows[0]?.value;
}

/** GET /api/version — databaseversjon. */
r.get('/', async (c) => {
  try {
    const version = await metaValue('version');
    if (!version) {
      return c.json({ version: '1970-01-01 00:00:00', importedAt: null, syncVersion: 0 });
    }
    const importedAt = await metaValue('imported_at');
    const syncVersion = await metaValue('sync_version');
    return c.json(
      {
        version,
        importedAt: importedAt || null,
        syncVersion: syncVersion ? parseInt(syncVersion, 10) : 0,
      },
      200,
      { 'Cache-Control': 'public, max-age=300' },
    );
  } catch (error) {
    console.error('Error fetching version:', error);
    return c.json({ version: '1970-01-01 00:00:00', importedAt: null, syncVersion: 0 }, 500);
  }
});

export default r;
