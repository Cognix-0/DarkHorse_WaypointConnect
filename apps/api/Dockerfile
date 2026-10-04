# Build context: repository root (see docker-compose.yml)
FROM node:20-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
 && corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN pnpm install --no-frozen-lockfile
COPY prisma prisma
COPY data data
COPY packages/shared packages/shared
COPY apps/api apps/api
COPY scripts/credentials.ts scripts/credentials.ts
RUN pnpm prisma generate
EXPOSE 3000
# Schema sync + idempotent seed on every start, then the API.
CMD ["sh", "-c", "pnpm prisma db execute --schema prisma/schema.prisma --file prisma/pre-push.sql && pnpm prisma db push --skip-generate && pnpm db:seed && pnpm --filter @waypoint/api start"]
