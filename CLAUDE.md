# Bibel — Bun + Hono (main)

Full omskriving av bibel-appen: Bun + Hono + hono/jsx SSR + vanilla JS-øyer, Bun.sql
(mysql-adapter) mot MySQL. Kjører på **bibel.flogvit.com** (deploy: `deploy/deploy-bibel.sh`).
Den gamle appen (Vite+React+Express+SQLite) ligger fryst på branchen **`bibel-no`** og
serverer bibel.flogvit.no inntil videre — deploy til .no må skje fra en checkout av den
branchen (`../server/deploy-bibel.sh`).

Plan og status: se `ISSUES.md`.

## Oppsett
- `bun install` — eneste runtime-dependency er `hono` + lokal `@free-bible/kvn`.
- `kvn-package/` er gitignort og stages fra `../free-bible/kvn/` av `deploy/deploy-bibel.sh`.
- `.env` (gitignort): `DB_PORT=3312` for lokal DBngin-MySQL (root, tomt passord, db `flogvit_bibel`).
- Prod-DB: managed MySQL (db-flogvit) via `DB_HOST`/`DB_PORT`/`DB_USER`/`DB_PASSWORD`/`DB_NAME`.

## Kommandoer
```bash
bun run dev            # utviklingsserver (--watch)
bun test               # tester
bun run typecheck      # tsc --noEmit
bun scripts/init-db.ts        # opprett skjema
bun scripts/import-bible.ts   # importer innhold fra ../free-bible/generate/ (inkrementell, --full for alt)
```

## Regler
- Minimal deps: innebygd/web-standard fremfor npm-pakker. Aldri React/Express/ORM-er.
- Bibeldata er derivert og regenererbar — aldri inn i Docker-imaget; import kjøres separat mot DB-en.
- **Issues spores på GitHub** (`flogvit/bibel.flogvit.no` — repo-navnet henger igjen fra før
  domenebyttet; main er .com-appen). Som i resten av flogvit.com-produktene. Nye funn/oppgaver
  → GitHub-issue. `ISSUES.md` dekker omskrivings-historikken #1–#18 (+ #19–#24 som er speilet
  til GitHub #1–#6) — oppdater den kun når disse endrer status.
- .no (branch `bibel-no`) skal IKKE røres — parallell drift til cutover-beslutning.
