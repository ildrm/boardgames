# Skill use record

| Project workflow | Milestones | Evidence |
|---|---|---|
| Product discovery | M0, M1, M6 | Host and guest walks and task assumptions in the [release brief](../product/prd.md). |
| Rules engine | M2, M4 | Replay and independent oracles in the [game-registry tests](../../packages/game-registry/tests/rules.test.ts). |
| Art direction | M0, M1, M4 | Three lobby and board concepts, original artwork and rendered review in the [design brief](../design/tabletop.md). |
| Accessibility and visual QA | M1, M4, M6 | Isolated browser sessions, responsive screenshots, automated catalog accessibility and [Persian keyboard scenario](../../tests/e2e/rtl.spec.ts). |
| Realtime reliability | M2–M5 | Cross-replica confirmation, pause, reconnect, idempotency and role swap in the [integration suite](../../tests/integration/multiplayer.test.ts). |
| Scale QA | M5 | Authorized loopback workload and latency summaries in the [Socket.IO workload](../../tests/load/smoke.ts). |
| Platform security | M0, M2–M6 | Access boundaries, outbox projection, safe invite review and [threat notes](../architecture/system.md). |
| Data and operations | M2, M5, M6 | Transaction, migration, deadlines and recovery in the [runbook](../operations/runbook.md). |

The available `frontend-design`, `web-design-guidelines`, `webapp-testing` and `test-driven-development` skills informed the web implementation and rule tests. Playwright tests use the workspace's locked runner and test against the real local API. The codebase-memory graph identified the game packages and application/transport boundaries. Direct source checks and the dependency-boundary script covered the implementation. Remaining upstream candidates were optional. The project workflow and local tools supplied the corresponding checks. The installed skill directories were used as provided by the workstation. Their upstream snapshots were not independently pinned in this repository.
