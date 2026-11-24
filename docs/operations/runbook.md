# Local operations and recovery

Use the Compose project for testing with synthetic players. Place production services on a private network with TLS, a managed secret source and a durable database. The example credentials and replay key are local fixtures.

| Situation | First check | Action and verification |
|---|---|---|
| API unavailable | `docker compose --profile replicas ps` and `/health/ready` on each API | Inspect redacted logs. Check migration completion and database/Redis connectivity. Verify a fresh room and two approved subscriptions after recovery. |
| Player disconnect | Check the room and match snapshots using the player's authorized session | Wait for reconnection and verify board, turn and lifecycle transition. A client countdown cannot decide the result. |
| Redis interruption | Look for delayed fanout and new-admission failures | Restore Redis, confirm both APIs can connect, then compare fresh authorized views. Open a defect if either snapshot diverges or an outcome used uncertain presence. |
| PostgreSQL unavailable | Readiness and connection pool | Restore the primary before reopening traffic. Compare receipts and board versions for previously acknowledged actions. |
| Worker pause or restart | Inspect background process health and due state | Restart the worker, observe backlog recovery and compare terminal board, result and version before/after. |
| Rotate a session secret | Assess active guest sessions and bootstrap recovery window | Use an explicit deployment plan across replicas. Confirm revoked sessions and stale recovery proofs cannot access private data. |

## Deploy and roll back

Build from the frozen lockfile. Test changes against an isolated PostgreSQL database before applying schema updates. Apply additive migrations before enabling their readers and writers. Keep previous supported game definitions while matches are pinned to them. Drain connections in a controlled batch and verify clients reconcile. Revert application traffic to the prior compatible image if health, invariants or versions regress. Use a forward migration for schema corrections when an older application can still read the current schema.

## Backup drill

Use an isolated database with completed and active matches. Capture a logical dump, restore to a separate database and compare its match, action and receipt records with a known acknowledged set. Record elapsed recovery time and the oldest acknowledged transition missing in the restored database, if any. For live operations, define retention, encryption, access, deletion and the managed service's point-in-time recovery procedure. A logical dump drill only establishes the measured restore behavior of that snapshot and environment.

## Local QA commands

- `TABLEMATE_RESTART_FIXTURE=1 node --import tsx --test apps/api/tests/replica-restart.test.ts` restarts only the local Compose secondary API. Run this separately from browser and load suites.
- `TABLEMATE_SMOKE_ROOMS=50 pnpm load:smoke` admits 100 loopback sockets at the documented session rate and then simultaneously plays 50 rooms. The admissions wait for new rate-limit windows. Run the load script separately from other session-creation tests.
- The metrics route on each API is enabled by `METRICS_TOKEN`. Import the dashboard into an existing Grafana, choose its Prometheus source and point that source at the private API /metrics addresses. Configure the bearer credential from the operator secret source. Sample the HTTP request and error counters using rates. Graph `tablemate_connected_sockets` per replica and compare `tablemate_socket_projection_total` with the observed activity. The HTTP error counter includes intentional rejections. Use user journey success and command timings for availability and latency.

[Grafana API dashboard](../../infra/monitoring/tablemate-grafana.json)
