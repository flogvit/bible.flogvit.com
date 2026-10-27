# mcp.bible.flogvit.com. Built with the bibel repo ROOT as context, because the
# server reads the database through bibel's own src/lib:
#
#   docker build -f mcp/Dockerfile .        (from bibel/)
#
# Dockerfile.dockerignore next to this file decides what reaches the build — a
# whitelist, so bibel's node_modules never do.
FROM oven/bun:1.4.4-slim
WORKDIR /app
# One node_modules at /app serves both /app/mcp/src and /app/src/lib (which
# imports hono).
COPY mcp/package.json mcp/bun.lock ./
RUN bun install --frozen-lockfile --production
# The verse numberings (#169): src/lib/verse-mapper.ts imports @free-bible/kvn,
# the vendored package bibel stages into kvn-package/ before any build. It is
# not an npm package, so it is copied where the import resolves rather than
# installed. The mapping files are read at run time — all 1158, since `mapping`
# takes any of them.
COPY kvn-package/package.json ./node_modules/@free-bible/kvn/package.json
COPY kvn-package/src ./node_modules/@free-bible/kvn/src
COPY kvn-package/mappings ./node_modules/@free-bible/kvn/mappings
COPY src/lib ./src/lib
COPY mcp/src ./mcp/src
# The icon is bibel's own (#128).
COPY public/favicon.svg public/favicon.ico public/apple-touch-icon.png ./public/
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER bun
CMD ["bun", "mcp/src/index.ts"]
