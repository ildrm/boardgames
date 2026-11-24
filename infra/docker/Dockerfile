FROM node:24-bookworm-slim@sha256:32e57b5784e8875d2cc0112dcaf13f9100f2d0d9446187808738e99aee29a5a2 AS service
WORKDIR /srv/tablemate
RUN corepack enable && chown node:node /srv/tablemate
COPY --chown=node:node package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY --chown=node:node apps/api/package.json apps/api/
COPY --chown=node:node apps/web/package.json apps/web/
COPY --chown=node:node apps/worker/package.json apps/worker/
COPY --chown=node:node packages/contracts/package.json packages/contracts/
COPY --chown=node:node packages/game-engine/package.json packages/game-engine/
COPY --chown=node:node packages/game-registry/package.json packages/game-registry/
COPY --chown=node:node packages/design-tokens/package.json packages/design-tokens/
COPY --chown=node:node packages/test-utils/package.json packages/test-utils/
COPY --chown=node:node packages/games/tic-tac-toe/package.json packages/games/tic-tac-toe/
COPY --chown=node:node packages/games/four-in-a-row/package.json packages/games/four-in-a-row/
USER node
RUN pnpm install --frozen-lockfile --registry=https://registry.npmjs.org
COPY --chown=node:node . .
EXPOSE 3000

FROM service AS web-build
RUN pnpm --filter @tablemate/web build

FROM nginxinc/nginx-unprivileged:1.28.0-alpine@sha256:c97ff0bf7cbae369953c6da1232ec14ad9f971d66360c5698db0856a4cd657a0 AS web
COPY infra/proxy/tablemate.conf /etc/nginx/conf.d/default.conf
COPY --from=web-build /srv/tablemate/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
