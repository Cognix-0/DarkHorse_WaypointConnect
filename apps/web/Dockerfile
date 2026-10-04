# Build context: repository root (see docker-compose.yml)
FROM node:20-slim AS build
RUN corepack enable
WORKDIR /app
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY pnpm-lock.yaml* ./
COPY packages/shared packages/shared
COPY apps/web apps/web
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @waypoint/web build

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
# nginx runs as a non-root user: files copied from a 600-mode checkout (sw.js) would answer 403.
RUN chmod -R a+rX /usr/share/nginx/html
EXPOSE 80
