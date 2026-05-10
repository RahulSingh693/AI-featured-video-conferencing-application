FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@9.12.0 --activate

WORKDIR /app

COPY . .

RUN pnpm install --no-frozen-lockfile

RUN PORT=3000 BASE_PATH=/ pnpm --filter "@workspace/meet-app" build

RUN pnpm --filter "@workspace/api-server" build

RUN cp -r artifacts/meet-app/dist public

EXPOSE 3000

ENV PORT=3000

ENV NODE_ENV=production

CMD ["node", "--enable-source-maps", "./artifacts/api-server/dist/index.mjs"]