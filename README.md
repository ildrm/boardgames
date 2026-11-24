# Tablemate

Play Tic-Tac-Toe or Four in a Row with a friend in a private browser room. Tablemate supports English and Persian. The host shares an invitation and starts after both players connect.

## Run locally

Use Docker with Compose v2, Node.js 24 LTS and pnpm 10.28.2. The browser stack is available at <http://localhost:8080>.

```sh
corepack enable
pnpm install --frozen-lockfile
docker compose --profile replicas up -d --build
```

The `replicas` profile runs two API instances. Compose applies the database migration before starting the APIs and worker. The exposed loopback ports are 8080 for web, 3000/3001 for API, 55432 for PostgreSQL and 56379 for Redis. Use `docker compose --profile replicas stop` to stop containers while retaining data.

To run the development services on your machine, run `docker compose up -d postgres redis`, create an environment from `.env.example` with a shared replay key, export its values, then run `pnpm db:migrate` followed by `pnpm dev`. Set `SESSION_REPLAY_KEY` to a random value of at least 32 characters, such as the output of `openssl rand -hex 32`. The Vite development server is at <http://localhost:5173>. `pnpm dev:fixture` starts the web and a single in-memory development API.

## Play and verify

Open the catalog and create a room. Open its invite link in a separate browser profile or private window and choose **Join game**. Return to the first window, select **Start game** and take turns using the board. After a win or draw, ask for a rematch, accept it in the other window and start it from the host window.

```sh
pnpm lint
pnpm typecheck
pnpm test
pnpm build
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
pnpm load:smoke
```

Integration and load tests target the local two-replica Compose profile. Set `TABLEMATE_SMOKE_ROOMS=50` for the 100-socket run. It paces admission to respect the API’s session limit. Browser tests use separate browser contexts. Set `TABLEMATE_CHROME=1` to use a locally installed Chrome channel. Set `TABLEMATE_TEST_BROWSER=firefox` or `webkit` after installing the corresponding Playwright browser. Keep the test stack and evidence isolated from personal data.

- [Specification and QA index](docs/README.md)
- [System architecture](docs/architecture/system.md) and [HTTP OpenAPI](apps/api/openapi.yaml)
- [Operations and recovery](docs/operations/runbook.md)
- [Verification and milestone record](docs/qa/verification.md)
