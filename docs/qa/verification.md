# Tablemate verification record

The local build supports multiplayer Tic-Tac-Toe and Four in a Row through private invitations, host Start, server-confirmed moves, reconnect, terminal results and mutual rematches. The project includes a static React/Vite client, two NestJS/Socket.IO replicas, PostgreSQL, Redis, a worker, Compose and CI.

## Build and observed results

On 24 November 2026 the working tree built from pnpm 10.28.2 and lockfile SHA-256 `2c5765acdd910f200ca13b96ec2f0c0cebf9a374a3f4712c1ad522970f419ae9`. Host tests ran on macOS arm64 with Node.js 26.12.0. Compose used Node.js 24.22.3 in the image pinned in the Dockerfile, PostgreSQL 17.10, Redis 7.4.7, Nginx 1.28.0 and two API replicas with an external worker. Chrome, Firefox and WebKit ran individually under Playwright 1.56.1. All identities and rooms used for evidence were synthetic.

| Check | Result | Evidence |
|---|---|---|
| Frozen lockfile install, lint, strict TypeScript and production build | Passed. Local Vite output was 132.10 kB gzip initial JS in the final Compose build and 0.79/0.82 kB gzip for the lazy board chunks. The checks also ran against shared game packages and test source. | [Workspace scripts](../../package.json), [Compose services](../../compose.yaml) |
| Unit and application tests | 21 passed. Checked input and wire versions, independent oracles, test-only 3/4-seat private projections, command receipts, deadline cutoffs, UNKNOWN presence, and lifecycle transitions. Tic-Tac-Toe visited 549,946 legal history nodes and 255,168 terminal games. | [Game rules tests](../../packages/game-registry/tests/rules.test.ts), [application tests](../../apps/api/src/application.test.ts) |
| Two API replicas with PostgreSQL and Redis | 3 passed. Both games completed a win and a rematch draw. Cross-replica invite race admitted one guest. Authenticated retry produced one effect across HTTP and Socket.IO. The guest disconnected and resumed through another replica. | [Integration suite](../../tests/integration/multiplayer.test.ts) |
| Browser workflows and accessibility checks | 12 passed, with four in each of Chrome, Firefox and WebKit. Isolated host and guest contexts completed both games and a rematch. The catalog passed the scoped axe-core check. A 320px Persian gameplay variant preserved physical board order, keyboard focus and readable duplicate names after theme and motion changes. WebKit exposed a focus-return bug. Explicit trigger focus and modal lifecycle timing fixed it, and WebKit passed the rerun. | [Browser suite](../../tests/e2e/play.spec.ts), [Persian scenario](../../tests/e2e/rtl.spec.ts), [selected screenshots](../design/tabletop.md#design-evidence) |
| Replica restart after a durable ACK | 1 passed. The synthetic move and original logical receipt survived the secondary API restart. Guest resumed on the primary and the restarted replica returned the same board. | [Controlled restart scenario](../../apps/api/tests/replica-restart.test.ts) |
| Isolated logical restore | Restored 12 matches, 103 transition records and 113 accepted receipts into a separate local database. The dump/restore pair completed in under the one-second resolution of the shell timer. Automated replay against all restored receipts and operational disaster RPO/RTO remain open. | [Backup drill procedure](../operations/runbook.md#backup-drill) |
| Dependency advisories | The initial runtime audit flagged 16 high and 13 lower-severity advisories. Updated NestJS, React Router, i18next, Zod and the Socket.IO versions. The replacement runtime tree reported zero advisories. The full tree had zero high or critical advisories, one moderate and one low in development dependencies. | [Audit command and lockfile](../../pnpm-lock.yaml) |

## Load observations

The final paced loopback run completed 50 simultaneous rooms with **100 sockets and 300 confirmed moves**. Each room advanced every five seconds during active play. The driver compared the confirmed board, version and final outcome on both replicas. It measured action submission to both receipt of the durable ACK and receipt of the opponent’s view using one monotonic clock.

| Observation | Final local smoke |
|---|---:|
| Active play duration | 34.928 s |
| Total admission and play duration | 222.838 s |
| p50 action to both clients | 16 ms |
| p95 action to both clients | 37 ms |
| p99 action to both clients | 70 ms |

Earlier 100-socket burst and paced runs encountered ACK timeouts after admission. An 8-socket check also missed an opponent update. The server had waited for its write queue to drain while the WebSocket could still be busy. It now retries projection when the transport becomes writable and closes only if that readiness remains unavailable. The final run also releases lobby subscriptions after both players subscribe to the match. The unpaced burst, sustained launch and growth workloads and larger scale targets remain unverified on the fixed build.

## Release gates still open

The M0 brief and M1 design references guided the work. M2–M4 have runnable core implementations with the evidence above. Full gate closure requires all applicable P0 variants in the matrix, including additional device and state coverage and a multi-seat test game exercised through the platform. The current 3/4-seat fixture covers the pure engine. Production room admission and forfeit reflect the two-player release policy.

Local replica restart and an isolated logical restore provide M5 evidence. Sustained launch and growth workloads, staged chaos across dependencies, distributed restore timing and stretch measurements still require their own runs. The database uses aggregate records and PostgreSQL invalidation for authorized cross-replica projections. The implementation choice and remaining scale questions are recorded in the storage ADR.

M6 remains open. Manual screen-reader checks, fluent-speaker Persian review, human usability research, complete variant coverage and field Web Vitals were not measured. Deletion requests revoke the session and persist an operator request. Automated fulfillment, full backup retention and production observability still require work.

## Evidence-based release score

This is a project review of the local build. The target in §0.1 is 90/100 overall with at least 25.5 design points, plus all applicable gates.

| Review area | Points | Basis |
|---|---:|---|
| Product, visual design and UX | 21/30 | Both journeys, artwork and responsive states verified across three browser engines. Manual screen-reader, full locale and device review remain open. |
| Architecture and extensibility | 13/20 | Pure versioned rules and reusable projections. The 3/4-seat fixture runs at the engine boundary. |
| Rules and correctness | 14/15 | Independent exhaustive and seeded oracles, documented histories and the two live games agree. Remaining platform variants are tracked. |
| Performance and scale | 4/15 | Build output and bounded local workload evidence. Sustained load and field Web Vitals remain unmeasured. |
| Security and reliability | 6/10 | Private authorization, dependency remediation and a controlled replica restart. Broader security and dependency outage drills remain open. |
| Tests and maintainability | 7/10 | Reproducible local checks and traceability in the matrix. Coverage of all variants remains open. |
| **Total** | **65/100** | **Local implementation ready for further validation.** |

- [QA definitions](../QA_SCENARIOS.md) and [execution tracker](../QA_SCENARIOS.csv)
- [Skill-use record](skill-use.md)
- [Aggregate storage decision](../adr/0002-aggregate-storage.md)
