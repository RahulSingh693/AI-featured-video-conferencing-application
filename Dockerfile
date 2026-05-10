# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --frozen-lockfile

# Build frontend — pass the env vars vite.config.ts requires at build time
RUN PORT=3000 BASE_PATH=/ pnpm --filter "@workspace/meet-app" build

# Build backend
RUN pnpm --filter "@workspace/api-server" build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Backend dist
COPY --from=builder /app/artifacts/api-server/dist        ./artifacts/api-server/dist

# Frontend built output (vite outDir is dist/public per vite.config.ts)
COPY --from=builder /app/artifacts/meet-app/dist/public   ./public

# Workspace files needed for prod install
COPY --from=builder /app/package.json          ./package.json
COPY --from=builder /app/pnpm-workspace.yaml   ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml        ./pnpm-lock.yaml
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json

RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]