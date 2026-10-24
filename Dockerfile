# To steg: alt som trengs for å BYGGE, og bare det som trengs for å KJØRE.
#
# Serveren kjørte tidligere `tsx api/server.ts` i prod — TypeScript kompilert
# ved hver oppstart, med en esbuild-prosess ved siden av og alle utviklings-
# avhengighetene i imaget (bible.flogvit.com#148). Nå bygges den én gang til
# server/server.mjs, og sluttimaget har Node, bundelen, frontenden og de
# native modulene bundelen ikke kan bære.
FROM node:22.23.4-alpine AS bygg

WORKDIR /app

# KVN-biblioteket (lokal avhengighet via file:)
COPY kvn-package/ ./kvn-package/
COPY package*.json ./
RUN npm ci

COPY . .

# Frontenden (Vite) til dist/, serveren til server/server.mjs. better-sqlite3
# er native og kan ikke bundles. `require` lages for CommonJS-pakkene
# (express, mysql2) som kaller den inne i en ESM-bundle.
RUN npm run build \
 && npx esbuild api/server.ts --bundle --platform=node --format=esm \
      --target=node22 --external:better-sqlite3 --legal-comments=none \
      --banner:js="import { createRequire } from 'module'; const require = createRequire(import.meta.url);" \
      --outfile=server/server.mjs

# Bare det better-sqlite3 trenger ved kjøring, med samme versjoner som lockfila.
RUN mkdir -p /runtime/node_modules \
 && cp -r node_modules/better-sqlite3 node_modules/bindings node_modules/file-uri-to-path /runtime/node_modules/ \
 && rm -rf /runtime/node_modules/better-sqlite3/deps /runtime/node_modules/better-sqlite3/src \
      /runtime/node_modules/better-sqlite3/build/Release/obj* /runtime/node_modules/better-sqlite3/build/Release/.deps \
      /runtime/node_modules/better-sqlite3/build/deps

FROM node:22.23.4-alpine

WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

COPY --from=bygg /runtime/node_modules ./node_modules
COPY --from=bygg /app/dist ./dist
COPY --from=bygg /app/server ./server
# KVN-lasteren leser `../mappings` relativt til modulen, og etter bundlingen
# er modulen server/server.mjs — derfor ligger katalogen i /app/mappings.
COPY --from=bygg /app/kvn-package/mappings ./mappings
COPY --from=bygg /app/data ./data

EXPOSE 8080

# Ingen npm og ingen tsx mellom init og serveren: én Node-prosess under taket.
CMD ["node", "server/server.mjs"]
