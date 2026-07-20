# Bibel — Bun+Hono-varianten (branch `hono`)

Full omskriving av bibel-appen: Bun + Hono + hono/jsx SSR + vanilla JS-øyer, Bun.sql
(mysql-adapter) mot MySQL. Skal deployes på **bibel.flogvit.com**. `main` er den gamle
appen (Vite+React+Express+SQLite) som serverer bibel.flogvit.no og beholdes inntil
videre; denne branchen merges til `main` når .com-varianten tar over.

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
- Oppdater `ISSUES.md` når issues endrer status.
