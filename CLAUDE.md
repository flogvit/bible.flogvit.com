# Bibel — Bun + Hono (main)

Full omskriving av bibel-appen: Bun + Hono + hono/jsx SSR + vanilla JS-øyer, Bun.sql
(mysql-adapter) mot MySQL. Kjører på **bible.flogvit.com** (bibel.flogvit.com 301-er dit) (deploy: `deploy/deploy-bibel.sh`).
Den gamle appen (Vite+React+Express+SQLite) ligger fryst på branchen **`bibel-no`** og
serverer bibel.flogvit.no inntil videre — deploy til .no må skje fra en checkout av den
branchen (`../server/deploy-bibel.sh`).

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
bun scripts/generate-sitemap.ts       # regenerer sitemap (statisk booksData, ingen DB)
bun scripts/generate-verse-counts.ts  # regenerer src/lib/verse-counts.ts fra DB
bun scripts/enrich-story-references.ts # berik historier i free-bible med evangelieparalleller
```

## Lokal innlogging (konto uten DB)
konto kan kjøres lokalt med in-memory store — full login/sync-flyt uten å røre noen DB:
```bash
cd ../konto && DB_DISABLED=1 PORT=3020 bun src/index.ts   # kontoer forsvinner ved restart
```
bibel-dev peker allerede på http://localhost:3020 (session.ts). Registrer en bruker med
`POST http://localhost:3020/api/auth/register {email, password}` (eller via UI-et) —
fv-session-cookien deles på localhost på tvers av porter, så bibel ser innloggingen og
sync mot lokal MySQL virker.

## Innholdsoppdatering til prod
**Bruk `deploy/deploy-bibel-data.sh`** — data-motstykket til `deploy-bibel.sh`. Det
gjør hele flyten i én kommando: import lokalt → atomisk per-tabell replace til prod
(`START TRANSACTION; DELETE; INSERT…; COMMIT`, ingen nedetid, håndterer sletninger) →
restart `bibel-hono`.
```bash
deploy/deploy-bibel-data.sh                          # full innholds-paritet (alle tabeller)
deploy/deploy-bibel-data.sh references_ persons stories content_hashes db_meta  # kun endrede
```
Under panseret: prod-DB nås via engangs `mysql:8`-klientcontainer på docker-nettet
`server_default` med env fra `/srv/flogvit.com/server/bibel.env`. Kun import-eide
innholdstabeller røres — aldri brukertabeller. Ta gjerne `mysqldump --skip-lock-tables`
av tabellene fra prod først (prod-brukeren mangler `RELOAD`, så `--single-transaction`
feiler der).

### KILDE: pass på riktig free-bible
Import leser `$FREE_BIBLE_DIR` (default: `flogvit.com/free-bible`, som er en **symlink**
→ det ekte `../free-bible`-repoet). Historisk felle: `flogvit.com/free-bible` var en
egen, stale klon — standard-importen leste da feil data og rapporterte «0 endringer».
Symlinken fikser dette; `deploy-bibel-data.sh` setter i tillegg `FREE_BIBLE_DIR`
eksplisitt til den resolverte stien.

## Regler
- Minimal deps: innebygd/web-standard fremfor npm-pakker. Aldri React/Express/ORM-er.
- Bibeldata er derivert og regenererbar — aldri inn i Docker-imaget; import kjøres separat mot DB-en.
- **Issues spores KUN på GitHub** (`flogvit/bible.flogvit.com`; main er .com-appen). Som i resten av flogvit.com-produktene. Omskrivingens
  historikk (#1–#18) lå i ISSUES.md — slettet 2026-07-22, se git-historikken ved behov.
- .no (branch `bibel-no`) skal IKKE røres — parallell drift til cutover-beslutning.
