// Oppretter databasen (om nødvendig) og hele skjemaet. Idempotent.
// Kjør: bun scripts/init-db.ts  (env: DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME)

import { SQL } from 'bun';
import { DB_NAME } from '../src/lib/db.ts';
import { ensureSchema, TABLE_COUNT } from '../src/lib/schema.ts';

const host = process.env.DB_HOST || '127.0.0.1';
const port = Number(process.env.DB_PORT || 3306);
const username = process.env.DB_USER || 'root';
const password = process.env.DB_PASSWORD || '';

// Første tilkobling uten database — den finnes kanskje ikke ennå.
//
// I PROD finnes basen allerede, og appbrukeren har med vilje ikke rett til å
// opprette databaser (GRANT er scopet til bibel-basen). Da feiler dette steget
// med 1044 «Access denied … to database 'mysql'» — og det er riktig oppsett,
// ikke en feil. Vi lar det gå videre: hvis basen mangler OG vi ikke kan lage
// den, feiler neste tilkobling uansett, med en tydeligere melding.
try {
  const admin = new SQL({ adapter: 'mysql', hostname: host, port, username, password });
  await admin
    .unsafe(`CREATE DATABASE IF NOT EXISTS ${DB_NAME} CHARACTER SET utf8mb4 COLLATE utf8mb4_danish_ci`)
    .simple();
  await admin.end();
} catch (err) {
  console.log(`  (hopper over CREATE DATABASE: ${(err as Error).message})`);
}

const sql = new SQL({ adapter: 'mysql', hostname: host, port, username, password, database: DB_NAME });
await ensureSchema(sql);

const rows = (await sql`
  SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = ${DB_NAME}
`) as { n: number | bigint }[];
console.log(`OK: ${DB_NAME} har ${rows[0]?.n}/${TABLE_COUNT} tabeller`);
await sql.end();
