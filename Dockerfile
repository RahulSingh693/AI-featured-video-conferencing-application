# ── Build stage ───────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

# Enable pnpm (same version you use locally)
RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy entire monorepo
COPY . .

# Install all workspace dependencies
RUN pnpm install --frozen-lockfile

# Build frontend (Vite → artifacts/meet-app/dist)
RUN pnpm --filter "@workspace/meet-app" build

# Build backend (esbuild → artifacts/api-server/dist)
RUN pnpm --filter "@workspace/api-server" build

# ── Production stage ──────────────────────────────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

# Copy only what's needed to run
COPY --from=builder /app/artifacts/api-server/dist        ./artifacts/api-server/dist
COPY --from=builder /app/artifacts/meet-app/dist          ./public
COPY --from=builder /app/artifacts/api-server/package.json ./artifacts/api-server/package.json
COPY --from=builder /app/package.json                      ./package.json
COPY --from=builder /app/pnpm-workspace.yaml               ./pnpm-workspace.yaml
COPY --from=builder /app/pnpm-lock.yaml                    ./pnpm-lock.yaml

# Install production deps only
RUN pnpm install --prod --frozen-lockfile

EXPOSE 3000

ENV PORT=3000
ENV NODE_ENV=production

# The Express server serves both the API and the built frontend static files
CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]