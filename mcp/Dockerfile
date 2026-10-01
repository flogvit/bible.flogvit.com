# mcp.bible.flogvit.com. Built with the bibel repo ROOT as context, because the
# server reads the database through bibel's own src/lib:
#
#   docker build -f mcp/Dockerfile .        (from bibel/)
#
# Dockerfile.dockerignore next to this file decides what reaches the build — a
# whitelist, so bibel's node_modules and kvn-package (109 MB) never do.
FROM oven/bun:1.3-slim
WORKDIR /app
# One node_modules at /app serves both /app/mcp/src and /app/src/lib (which
# imports hono).
COPY mcp/package.json mcp/bun.lock ./
RUN bun install --frozen-lockfile --production
COPY src/lib ./src/lib
COPY mcp/src ./mcp/src
ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080
USER bun
CMD ["bun", "mcp/src/index.ts"]
