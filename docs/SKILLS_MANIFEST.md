# Tablemate skills and references

Use the eight workflows below with the [master specification](MEGA_PROMPT.md) and [QA scenarios](QA_SCENARIOS.md). They are written out here because this checkout contains no project `.agents/skills/` directory. An agent or human reviewer can produce the same deliverables from the documents.

## Project workflows

| Workflow and milestones | What to do | Evidence to hand off |
|---|---|---|
| `board-game-product-discovery` · M0, M1, M6 | Walk the invite journey as host and guest. At each screen record what the player knows, the next available action and the recovery if it fails. Distinguish observations from hypotheses. | Two role journeys and a screen/state inventory. Use CAT, ROM, STA and UX cases. Label a walkthrough separately from participant research. |
| `board-game-rules-engine` · M0, M2, M4 | Replay the fixtures in §2 one ply at a time. Check occupancy, active seat, legal actions and the first terminal ply against an independent rules oracle. Repeat against the pinned rules version. | Expected boards/results, reproducible property-test seeds, TTT/FIR cases and the ARCH contract results. |
| `board-game-product-art-direction` · M0, M1, M4, M6 | Compare the three directions against §4.1. Show the same lobby and board in each. Carry the selected geometry, type, piece motifs and status hierarchy through both games. | Selected references at phone and desktop widths, asset sources/licenses, state variants and DES findings with screenshot pairs. |
| `board-game-accessibility-visual-qa` · M1, M3, M4, M6 | From the keyboard, create, join, play and request a rematch. Repeat with a screen reader. Inspect focus after remote moves, narrow RTL layouts, motion preferences and piece identity in forced colors. | Device, browser, assistive technology, locale, input method, observed announcements and UX/A11/DES case IDs. |
| `multiplayer-realtime-reliability` · M2–M5 | Trace one move from command through commit, ACK and delivery. Then lose the ACK, reconnect on another replica, and compare both authorized snapshots. Exercise the cutoff with the database clock. | Before/after versions, sanitized event/receipt references, race ordering and ACT/NET assertions. |
| `multiplayer-scale-qa` · M3–M6 | State the authorized workload and environment. Exercise real sessions, rooms and legal moves. Measure useful actions, delivery latency, errors, saturation and recovery over a named interval. | Workload, sample sizes, distributions, resources, invariant checks and OPS cases. Record the highest measured stage separately from stretch targets. |
| `board-game-platform-security` · M0, M2–M6 | Map each private read, mutation and delivery to its authorized viewer. Review session expiry, invite redemption, hidden-state projection and redaction across logs, caches and traces. | Trust-boundary diagram, access decisions, residual findings and SES/SEC case references from an authorized environment. |
| `board-game-data-and-operations` · M2, M5, M6 | Follow a state change across the room, match, action, receipt, deadline and outbox records. Review lock order and cleanup. Compare restored synthetic data with the acknowledged history. | Transaction diagram, migration/rollback and restore records, measured RPO/RTO and ACT/OPS results. |

## Optional upstream skills

These 17 candidates are grouped by publisher. Select the smallest set that helps with the current milestone. A catalog entry establishes a place to look. Installation, permission to execute scripts and observed use each require separate evidence.

| Upstream | Candidate names | Intended use |
|---|---|---|
| [Anthropic skills](https://github.com/anthropics/skills) | `frontend-design`, `webapp-testing` | Develop visual direction at M1. Exercise browser flows and collect reproduction evidence at M3–M6. |
| [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) | `ui-ux-pro-max` | Explore palette, type and interaction alternatives at M1. Check the chosen states against the accessibility requirements. |
| [Vercel agent skills](https://github.com/vercel-labs/agent-skills) | `web-design-guidelines`, `vercel-react-best-practices`, `vercel-composition-patterns` | Review usability findings, React rendering/bundle behavior and component composition at M1–M6 as applicable. |
| [Supabase agent skills](https://github.com/supabase/agent-skills) | `supabase-postgres-best-practices` | Review schema, lock scope, indexes, pool budgets and query plans at M2–M5. Applicable to the PostgreSQL design regardless of host. |
| [OpenAI skills catalog](https://github.com/openai/skills) | `playwright`, `security-best-practices`, `security-threat-model` | Browser evidence at M3–M6, source review at M2–M6 and trust-boundary review at M0/M6. Check the catalog for the target agent's supported distribution. |
| [Superpowers](https://github.com/obra/superpowers) | `brainstorming`, `writing-plans`, `executing-plans`, `test-driven-development`, `systematic-debugging`, `requesting-code-review`, `verification-before-completion` | Explore and plan at M0. During implementation, use focused tests, reproduction, review and recorded verification at the relevant gates. |

### Review and use record

First check what the target environment already provides. For an external candidate, locate its declared skill name at a pinned revision, read the instructions and referenced scripts, check the license, required permissions and destinations for data. Use the target agent's supported installation method only when installation is in scope. If a candidate is unavailable or unsuitable, record the reason and use the corresponding workflow above.

Keep one entry per candidate considered in the implementation handoff. Record the milestone, skill name, URL, revision, license, reviewer/date, files and scripts reviewed, allowed scope, local path if present, and the resulting evidence link. Use **available**, **reviewed**, **installed**, **used** or **skipped** for the furthest verified step. A **used** entry identifies the artifact or finding it helped produce. A **skipped** entry identifies the workflow used in its place.

## Primary references by decision

| Decision | Reference |
|---|---|
| Classic drop-disc play | [Hasbro classic game instructions](https://instructions.hasbro.com/en-gb/instruction/the-classic-game-of-connect-4). Tablemate's board coordinates, legal histories, canonical winning runs and Tic-Tac-Toe rules are specified in [§2](MEGA_PROMPT.md#2-complete-game-rules-and-invariants). |
| Contrast, reflow, target size and keyboard behavior | [WCAG 2.2](https://www.w3.org/TR/WCAG22/) and [WAI-ARIA grid keyboard guidance](https://www.w3.org/WAI/ARIA/apg/patterns/grid/). |
| Color as a design hypothesis | [Elliot and Maier on color and psychological functioning](https://doi.org/10.1146/annurev-psych-010213-115035). Evaluate piece legibility and contrast on the actual board. |
| Browser performance and isolated host/guest sessions | [Core Web Vitals](https://web.dev/articles/vitals) and [Playwright browser contexts](https://playwright.dev/docs/browser-contexts). |
| Gateway, transport and application recovery | [NestJS gateways](https://github.com/nestjs/docs.nestjs.com/blob/master/content/websockets/gateways.md), [Socket.IO delivery guarantees](https://socket.io/docs/v4/delivery-guarantees/) and [connection state recovery](https://socket.io/docs/v4/connection-state-recovery/). |
| Replica routing and representative traffic | [Socket.IO multi-node deployment](https://socket.io/docs/v4/using-multiple-nodes/), [Redis Streams adapter](https://socket.io/docs/v4/redis-streams-adapter/), [Socket.IO load testing](https://socket.io/docs/v4/load-testing/) and [Artillery Socket.IO engine](https://www.artillery.io/docs/reference/engines/socketio). |
| Aggregate concurrency and transaction retries | [PostgreSQL explicit locking](https://www.postgresql.org/docs/current/explicit-locking.html) and [transaction isolation](https://www.postgresql.org/docs/current/transaction-iso.html). |
| Access controls, transport review and observability | [OWASP WebSocket guidance](https://cheatsheetseries.owasp.org/cheatsheets/WebSocket_Security_Cheat_Sheet.html), [OWASP ASVS](https://asvs.owasp.org/) and [OpenTelemetry documentation](https://opentelemetry.io/docs/). |

Use the reference for the version actually selected and record it with the decision. The grace periods, role rotation, performance budgets and capacity stages in the master specification are Tablemate product and engineering choices.
