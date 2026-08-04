# bibel.flogvit.com — Hono + Bun. Ingen byggesteg (Bun kjører TS direkte), så
# dette bygger rent på VM-en. Bibelinnholdet bor i managed MySQL — ingen
# 170MB bible.db i imaget lenger (import kjøres utenfra, se scripts/).
FROM oven/bun:1.3-slim
WORKDIR /app
COPY package.json bun.lock* ./
# kvn-package er en vendored file:-dependency og må ligge der før bun install.
COPY kvn-package ./kvn-package
RUN bun install --frozen-lockfile --production || bun install --production
# tsconfig.json bærer jsxImportSource: hono/jsx — Bun leser den ved kjøring for
# å transpilere .tsx-viewene; uten den faller Bun til react/jsx-runtime og krasjer.
COPY tsconfig.json ./
COPY src ./src
# scripts/ maa vaere med: deployen kjoerer `bun scripts/init-db.ts` FRA imaget
# for aa lofte prod-skjemaet foer tjenesten starter. Appen kjoerer ikke
# ensureSchema() selv, saa uten dette kan en kode-deploy aldri migrere — og
# kode som forventer en ny kolonne tar ned siden (skjedde 2026-07-26).
COPY scripts ./scripts
COPY public ./public
# Delene kapittelkortet settes sammen av (#68). Uten dem faller HVERT
# kapittelkort tilbake til det generiske — og det svarer 200, så ingen
# feillogg ville sagt fra. `test/og-chapter-card.test.ts` holder på linja.
COPY assets/og/generated ./assets/og/generated
# Endringsloggen rendres av /changes ved kjoretid.
COPY RELEASE.md ./
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
CMD ["bun", "src/index.ts"]
