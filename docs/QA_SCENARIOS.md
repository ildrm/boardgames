# Tablemate QA scenarios

Each ID defines an acceptance test. The first 214 IDs are retained. This edition adds 12 cases for policy and protocol boundaries. The [CSV tracker](QA_SCENARIOS.csv) mirrors the definitions and holds execution evidence. All 226 scenarios begin at **NOT RUN**.

## How to run and record a case

1. Select an ID and read the cited section of the [master specification](MEGA_PROMPT.md). The milestone is when the complete evidence for that row is reviewed. Its component checks may run earlier.
2. Apply the shared setup below, then the row's precondition and action. Shared gameplay cases run in both games. For other shared cases, exercise both games wherever game choice affects the path. Run all alternatives listed in a row. The expected result applies to every required variant.
3. In the CSV record the build/commit, environment and variants under **Environment**, the command or manual procedure under **Test reference**, the observation under **Actual**, the artifact under **Evidence** and the tester under **Owner**. Use synthetic identities and redact invitation links, cookies and private payloads.
4. A **PASS** covers every required variant on the named build and links to evidence. Any observed mismatch is **FAIL**. Use **BLOCKED** for an identified dependency preventing completion, and record what would unblock it. **NOT RUN** covers untouched or partially executed cases with no observed failure or blocker. List any completed variants in Actual. Archive the prior run before replacing execution fields for a new build.

**Priority.** P0 covers core behavior and release blockers. P1 covers further design, operational or validation requirements. P1 findings that meet a blocker in §0.1 still block release. Priority controls review order. It does not grant a waiver or establish defect severity. A capacity claim requires a run at the claimed stage regardless of test priority.

## Shared setups

| Setup | Preconditions and procedure |
|---|---|
| Browser pair | Use separate host and guest browser contexts with independent cookies. Keep a third context for an outsider. For a multi-tab test, open another tab inside the relevant player's context. Record locale, browser/device and game. |
| Ready room | Host creates a room and shares its issued URL. Guest previews, explicitly joins and subscribes. Wait for two verified seats. Exercise host Start or guest waiting as specified. |
| Legal replay | Start with an empty match and record the server-assigned opener. Alternate seats using the matching replay fixture in §2 (cell indexes for TTT, columns for FIR). Check the first terminal ply, board, version, line order and both authorized views. Synthetic geometry tests are labeled separately. |
| Competing commands | Route clients to separate replicas with a shared database. Use a barrier at the same starting version, then release the commands in each relevant order. Compare ACKs, snapshots, action count, receipt count and outbox effects after drain. A transport duplicate may have several deliveries and one durable effect. |
| Deadline | Use a controlled authoritative clock. Record reservation/loss time, generation and cutoff. Independently run just before, at and just after the cutoff, with the job on time and delayed. Compare the durable transition and both views after sync. |
| Visual and accessibility | Record viewport, zoom, theme, locale, input and assistive technology. Compare host and guest views with the reference for that state. Inspect text, focus, piece identity and action availability. Use real announcements and screenshots as relevant. |
| Operations | Use isolated data, a named workload, replica and worker counts, observation window, generator resources and authorization appropriate to the stage. Correlate measured user-visible behavior with redacted durable records. |

**First playable smoke run.** In both games, create (ROM-01), preview without consuming (ROM-05), join (ROM-06), start (STA-01), play the first horizontal-win fixture (END-01), then consent and start a rematch (END-06/07). In a separate active match, disconnect and resume (NET-05/06). Keep the two clients' views and the committed match IDs. This sequence samples the critical path. Full gates use the matrix below.

## Coverage index

| Scenario family | Master spec | Cases |
|---|---|---:|
| [CAT · Catalog and navigation](#cat) | §1.2, §4.5 | 3 |
| [SES · Guest sessions](#ses) | §1.4, §7.1, §8 | 8 |
| [ROM · Private rooms and invitations](#rom) | §1.4, §3, §7.1 | 26 |
| [STA · Start and readiness](#sta) | §3, §6.2, §7.2 | 11 |
| [TTT · Tic-Tac-Toe](#ttt) | §2.1–2.2 | 11 |
| [FIR · Four in a Row](#fir) | §2.3–2.4 | 14 |
| [ACT · Commands and convergence](#act) | §6.2–6.3, §7.2–7.3 | 25 |
| [NET · Presence and recovery](#net) | §1.4, §3.3, §7.4 | 25 |
| [END · Outcomes, series and rematches](#end) | §1.4, §3, §5.2 | 18 |
| [UX · Player journeys and localization](#ux) | §4.5–4.10 | 14 |
| [DES · Art direction and visual design](#des) | §4.1–4.10 | 20 |
| [A11 · Accessibility and input](#a11) | §4.6–4.10 | 10 |
| [SEC · Security and privacy](#sec) | §7–8 | 16 |
| [ARCH · Extensibility and contracts](#arch) | §5–6 | 4 |
| [OPS · Operations and capacity](#ops) | §9–10 | 21 |

**Layers.** UNIT = unit, PBT = property-based, INT = integration, API = HTTP contract, E2E = browser end-to-end, VIS = visual, A11Y = accessibility, UX = usability, SEC = security, CHAOS = controlled fault injection, LOAD = authorized workload, OPS = operational review, STATIC = static review.

<a id="cat"></a>

## CAT · Catalog and navigation

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| CAT-01 | New visitor opens catalog | Only two enabled games; useful descriptions; functional create CTA; no mandatory account | E2E | P0 | M3 |
| CAT-02 | Catalog loading, failure or disabled game | Stable accessible skeleton; retry; disabled game cannot create room | E2E/API | P0 | M3 |
| CAT-03 | Unknown or unauthorized deep link | Safe recovery/404; no private state leakage | E2E/API | P0 | M4 |

<a id="ses"></a>

## SES · Guest sessions

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| SES-01 | Valid nickname, new guest; two guests choose identical names | Distinct server principals and secure cookies; display names not identity | INT/E2E | P0 | M3 |
| SES-02 | Submit empty, oversized, control or unsafe bidi names, then submit markup-like text | Invalid names produce a field error without persistence. Any accepted markup-like nickname is rendered as literal text. | SEC/E2E | P0 | M3 |
| SES-03 | Refresh or new tab with existing session | Same principal and seat; no duplicate user | E2E | P0 | M3 |
| SES-04 | Session expired or revoked | Action/subscribe denied; recovery; same nickname cannot reclaim seat | SEC/INT | P0 | M3 |
| SES-05 | Retry guest bootstrap after losing Set-Cookie, then try after the five-minute window | Same valid bootstrap proof and ID recover the same session within the window. After expiry use /me or explicit new guest creation. Ordinary receipts and logs contain no secret. | INT | P0 | M3 |
| SES-06 | Revoke an authenticated session, then exercise deletion with a separate synthetic principal | Revocation fences its sockets. An authorized deletion request follows the documented retention process and preserves active-match integrity. | INT/SEC | P0 | M6 |
| SES-07 | With a match in play, revoke the only valid session for one seat | Fence its sockets and private reads. With no valid connection remaining, PAUSE and use the disconnect deadline. No resignation or immediate win. | SEC/INT | P0 | M4 |
| SES-08 | Create valid 1- and 24-grapheme names, a Persian name containing ZWNJ and a name above the normalized 256-byte limit | Boundary-length names within the byte limit are accepted. Preserve Persian joining. Reject excess bytes and show the field error in the active locale. | UNIT/E2E | P0 | M3 |

<a id="rom"></a>

## ROM · Private rooms and invitations

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| ROM-01 | Host creates selected game room | OPEN/WAITING, one host seat, capacity 2, invite, disabled Start | INT/E2E | P0 | M3 |
| ROM-02 | Invalid game, version, capacity or options | Reject; no room/invite written | INT | P0 | M3 |
| ROM-03 | Double-click create, retry same key | One room/seat; idempotent logical result | INT/E2E | P0 | M3 |
| ROM-04 | Copy/share invite, including permission denial | Actual success only; selectable manual fallback if unsupported/denied | E2E | P0 | M3 |
| ROM-05 | Bot opens link or calls preview | No redemption/reservation; limited safe metadata only | INT/SEC | P0 | M3 |
| ROM-06 | Guest explicitly joins valid invite then subscribes | Atomic seat/token, host sees name and presence without refresh | INT/E2E | P0 | M3 |
| ROM-07 | Guest commits Join. Inspect host and guest before the first authorized guest connection | Host sees an occupied seat and connecting status. Start is disabled and the server rejects Start. The guest sees waiting status. | INT/E2E | P0 | M3 |
| ROM-08 | Two guests contend for last seat on separate replicas | Only one admitted; no capacity overflow; loser gets safe recovery | INT/CHAOS | P0 | M3 |
| ROM-09 | Existing member reopens consumed invitation | Same authorized seat; no second consumption | INT/E2E | P0 | M3 |
| ROM-10 | Outsider tries consumed/expired/revoked invite | Safe unavailable response; no member details | INT/SEC | P0 | M3 |
| ROM-11 | Host rotates invite, guest tries previous one | Old invalid; new valid; no seat takeover | INT/E2E | P0 | M3 |
| ROM-12 | Host refresh loses in-memory raw invite | Explicit rotate with warning; no plaintext secret recovered from storage/log | E2E/SEC | P0 | M3 |
| ROM-13 | Host opens own invite | Same host seat; no self-opponent or false readiness | INT | P0 | M3 |
| ROM-14 | Guest already active in other room | Return/leave confirmation; no silent membership switch/orphan | INT/E2E | P0 | M3 |
| ROM-15 | Guest explicitly leaves before match | Seat removed, WAITING, old invite revoked; host can issue new | INT/E2E | P0 | M3 |
| ROM-16 | Host explicitly leaves before match | CLOSED, guest notified, invitation invalid | INT/E2E | P0 | M3 |
| ROM-17 | Lobby idle expiry and stale cleanup job | EXPIRED idempotent; later join/start denied; stale job cannot close renewed room | INT | P0 | M3 |
| ROM-18 | Outsider guesses room ID or token | Denied with no private identity/board/membership leakage | SEC | P0 | M3 |
| ROM-19 | Join races rotate/close/expire | One valid serialized result; no orphan or double redemption | INT/CHAOS | P0 | M3 |
| ROM-20 | Multiple tabs per principal | One seat; only last valid connection loss counts; authorized tabs converge | INT/E2E | P0 | M4 |
| ROM-21 | Guest join commits but response lost | Retry existing authorized seat, no double consume; host notified once logically | INT/CHAOS | P0 | M3 |
| ROM-22 | Redeem fresh invitation variants just before, exactly at and after their database expiry | Only the strictly early redemption succeeds. At equality and later the seat remains empty and the outsider sees INVITATION_UNAVAILABLE. | INT | P0 | M3 |
| ROM-23 | Guest never establishes a first authorized connection. Advance the database clock 120 seconds from the seat commit | Release that seat once, invalidate the previous invite and allow the host to issue a fresh invitation. | INT | P0 | M3 |
| ROM-24 | Two active memberships attempted by same principal on different nodes | Partial unique/transaction enforces single active room; clear recovery | INT/CHAOS | P0 | M3 |
| ROM-25 | Lose the initial invite issuance response, then retry with the same command ID | Recover the same room and invite status without the secret. Only explicit host rotation invalidates the old link and returns a new one. | INT/CHAOS | P0 | M3 |
| ROM-26 | Host creates a room but never establishes its first verified room connection | At 120 seconds from the host reservation close the room and invalidate the invitation. A late host tab cannot reopen it. | INT | P0 | M3 |

<a id="sta"></a>

## STA · Start and readiness

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| STA-01 | Both seats have verified presence. The host submits Start at the current roomVersion | One ACTIVE match, version "1", empty board and one persisted role draw. Both players reach the same match ID. | INT/E2E | P0 | M3 |
| STA-02 | Guest sends Start directly | NOT_HOST; no DB change or start for others | SEC/INT | P0 | M3 |
| STA-03 | Host starts before READY or after verified guest loss | ROOM_NOT_READY. Both clients stay in the room and no match row exists. | INT/E2E | P0 | M3 |
| STA-04 | Two simultaneous Start commands/tabs/nodes | One active match; no role reroll; dedup/conflict | INT/CHAOS | P0 | M3 |
| STA-05 | Join/Leave/Start race | Valid serialized outcome; no match with incomplete roster | INT | P0 | M3 |
| STA-06 | Guest misses Start event | Room sync finds currentMatchId and recovers authorized match | INT/E2E | P0 | M3 |
| STA-07 | Start commits but ACK lost | Same command ID resolves same match; no duplicate | CHAOS | P0 | M3 |
| STA-08 | New rules version deployed while old match active | Old match pinned; new version only where enabled; safe compatible renderer | INT | P0 | M5 |
| STA-09 | Host may be X/A or O/B based on injected RNG | Host permission independent of opening role; one persisted draw | UNIT/INT | P0 | M3 |
| STA-10 | Presence UNKNOWN at Start | No competitive start on unverifiable readiness; clear degraded state | INT/CHAOS | P0 | M3 |
| STA-11 | At the same roomVersion the guest becomes present. Then deliver a presence update tied to an earlier roster | A newer revision for the current roster can enable Start. A mismatched roster cannot enable it. Full sync resolves ambiguity before further Start attempts. | INT/E2E | P0 | M3 |

<a id="ttt"></a>

## TTT · Tic-Tac-Toe

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| TTT-01 | New Tic-Tac-Toe match | 9 empty cells; X starts; server role mapping | UNIT/INT | P0 | M2 |
| TTT-02 | Active player chooses empty cell | Exactly one correct mark; version +1; correct next turn | UNIT/E2E | P0 | M4 |
| TTT-03 | Occupied cell, negative/3/fraction/string/null coordinates | Reject; state, version and turn unchanged | UNIT/INT | P0 | M2 |
| TTT-04 | Replay reachable examples for all eight lines with each winning role | Return the correct canonical line or lines and stop at the first terminal ply. | UNIT | P0 | M2 |
| TTT-05 | Final mark completes two lines | Both lines, single terminal result and score | UNIT/INT | P0 | M2 |
| TTT-06 | Win on ninth move | WIN rather than DRAW | UNIT | P0 | M2 |
| TTT-07 | Full board with no line | DRAW; no further moves | UNIT/E2E | P0 | M4 |
| TTT-08 | Unreachable or invalid mark-count state | Schema/invariant/replay failure; not treated as healthy match | UNIT | P0 | M2 |
| TTT-09 | Exhaustive legal DFS | Oracle agreement; terminal nodes never expanded; valid turn/action list | UNIT | P0 | M2 |
| TTT-10 | All valid actions are applied to frozen original state | Pure immutable transition; no mutation of past snapshots | UNIT | P0 | M2 |
| TTT-11 | Natural win under mirrored/rotated legal histories | Equivalent outcome and transformed lines; coordinates remain canonical | UNIT/PBT | P0 | M2 |

<a id="fir"></a>

## FIR · Four in a Row

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| FIR-01 | New Four in a Row match | 42 empty cells; A starts | UNIT/INT | P0 | M2 |
| FIR-02 | Drop in empty and partially occupied column | Lowest free slot; correct confirmed animation destination | UNIT/E2E | P0 | M4 |
| FIR-03 | Full column or invalid index | Reject; turn and version unchanged; readable full indicator | UNIT/E2E | P0 | M4 |
| FIR-04 | Horizontal/vertical wins at middle and edges | Correct maximal run and terminal result | UNIT | P0 | M2 |
| FIR-05 | Both diagonals and corner positions | Correct runs without coordinate wrapping | UNIT | P0 | M2 |
| FIR-06 | Gap or opponent interrupts line | No false win | UNIT | P0 | M2 |
| FIR-07 | Replay the §2.4 connected-five, six, seven and two-axis fixtures | Return each maximal run once, ordered by axis and coordinates. Every fixture produces one result and one series win. | UNIT | P0 | M2 |
| FIR-08 | 42-ply draw fixture | DRAW; no earlier winner | UNIT/INT | P0 | M2 |
| FIR-09 | Win on ply 42 | WIN before draw evaluation | UNIT | P0 | M2 |
| FIR-10 | Client supplies row/owner or persisted floating disc | Strict schema/invariant rejection; server derives row and owner | SEC/UNIT | P0 | M2 |
| FIR-11 | Seeded legal game generator and full-scan oracle | Correct result, gravity and count invariants | UNIT/PBT | P0 | M2 |
| FIR-12 | Mirror every legal generated column sequence | Equivalent winner/result and mirrored maximal lines | UNIT/PBT | P0 | M2 |
| FIR-13 | Deserialize malformed 6x7 board or unsupported cell role | Strict validation rejects; no corrupted board rendered as valid | UNIT | P0 | M2 |
| FIR-14 | Full column rejected then different legal column chosen | Correct same player proceeds; no phantom turn switch | UNIT/E2E | P0 | M4 |

<a id="act"></a>

## ACT · Commands and convergence

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| ACT-01 | Wrong-turn or nonmember action | Reject with unchanged state/turn/version | INT/SEC | P0 | M4 |
| ACT-02 | Two rapid actions with same expectedVersion | Only one commit; other stale/invalid | INT/E2E | P0 | M4 |
| ACT-03 | Retry same accepted action ID and payload | Same receipt; one move/version | INT | P0 | M4 |
| ACT-04 | Same command ID with changed payload | COMMAND_ID_REUSED; no effect | INT/SEC | P0 | M4 |
| ACT-05 | Action after terminal or during pause | Reject; immutable terminal snapshot/result | INT | P0 | M4 |
| ACT-06 | Stale version from other tab | Reject and sync; no application on latest board | INT/E2E | P0 | M4 |
| ACT-07 | Late/duplicate event after newer view | No rollback or repeated animation | INT/E2E | P0 | M4 |
| ACT-08 | Event gap or subscription handshake race | Authoritative sync and both clients converge | INT/CHAOS | P0 | M4 |
| ACT-09 | Process crash before action commit | No partial effect; retry can apply once | CHAOS | P0 | M5 |
| ACT-10 | Crash after commit before ACK/publish | Move durable; outbox/retry recover without duplicate | CHAOS | P0 | M5 |
| ACT-11 | Duplicate or reordered worker publish | Monotonic view and one logical/visual effect | CHAOS | P0 | M5 |
| ACT-12 | Move races resign/expiry/leave | One valid order; no terminal overwrite | INT/CHAOS | P0 | M4 |
| ACT-13 | Oversized/malformed/extra-field payload | Bounded safe reject; no crash/state change | SEC | P0 | M4 |
| ACT-14 | Submit an identical game action concurrently through HTTP and the socket on separate replicas | For both transports the command ID, payload and expected version resolve to one receipt and one committed move. | INT/CHAOS | P0 | M4 |
| ACT-15 | Retry accepted command with old version after later moves | Original receipt, no stale overwrite or reapplication | INT/E2E | P0 | M4 |
| ACT-16 | Replay receipt after session revoked or membership removed | Authorization denies receipt details | SEC/INT | P0 | M4 |
| ACT-17 | Retry an accepted creation at the 24-hour receipt cutoff and again after receipt cleanup while the principal can still retry | The minimal key record prevents a second room. COMMAND_EXPIRED directs the authorized client to its current membership. | INT | P0 | M5 |
| ACT-18 | Deadlock or serialization failure injected | Bounded retries with same logical ID; no extra random draw/effect | INT/CHAOS | P0 | M5 |
| ACT-19 | Snapshot received while buffered newer events pending | Apply valid versions monotonically; no missed update | INT/E2E | P0 | M4 |
| ACT-20 | Late event/ACK from previous match after rematch | Ignored by aggregate identity; new board unchanged | E2E | P0 | M4 |
| ACT-21 | Move attempted offline with Socket.IO buffered emission | No stale offline move auto-applied upon reconnect | E2E/INT | P0 | M4 |
| ACT-22 | Natural winning move commits | One combined transition, one version increment, one terminal result | INT | P0 | M4 |
| ACT-23 | Persistent invalid snapshot detected on hydration | Safe unavailable/quarantine, operator evidence; no silent reset | INT | P0 | M5 |
| ACT-24 | Deliver versions "9", "10" and late "9". Repeat with adjacent decimal versions above the exact JavaScript Number range | Apply the numeric successor every time. An older event or ACK never rolls back the board or repeats a move. | UNIT/INT | P0 | M4 |
| ACT-25 | An ACTIVE match reaches the idle cutoff. A legal move gets the lock before the delayed idle worker | Commit ABANDONED/IDLE_TIMEOUT once and reject the move. The idle transition advances the version once and the board and move count stay unchanged. | INT/CHAOS | P0 | M5 |

<a id="net"></a>

## NET · Presence and recovery

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| NET-01 | Guest loses last connection before Start | Seat reserved; WAITING and Start disabled | E2E/INT | P0 | M3 |
| NET-02 | Guest reconnects to different node within grace | Same seat; ready when both present; token not reused | INT/CHAOS | P0 | M5 |
| NET-03 | Guest pre-start grace expires | Seat released and old invite revoked; fresh invite possible | INT | P0 | M3 |
| NET-04 | Host pre-start grace expires | Room CLOSED; guest recovery; invite invalid | INT | P0 | M3 |
| NET-05 | Participant loses last connection during match | PAUSED, exact board preserved, deadline, moves rejected | INT/E2E | P0 | M4 |
| NET-06 | Reconnect during grace after refresh or on different node | Same match; resume with lifecycle version; same board/turn | INT/E2E | P0 | M4 |
| NET-07 | Rapid reconnect then old disconnect event | New lease preserved; stale deadline no-op | INT/CHAOS | P0 | M5 |
| NET-08 | One expired absent, other confirmed present | One disconnect forfeit; correct winner; no fake line | INT | P0 | M5 |
| NET-09 | Both absent at first expiry | ABANDONED, no winner; correct result on return | INT | P0 | M5 |
| NET-10 | Record a verified reconnect 1 ms before or 1 ms after the cutoff and process the job late | Use presence at the cutoff. The early player keeps the seat. A late reconnect cannot erase the due outcome. | INT/CHAOS | P0 | M5 |
| NET-11 | Close one of two authorized tabs | Match remains live with other connection | INT/E2E | P0 | M5 |
| NET-12 | Refresh/close/back while move pending | Session/board recover; not resign; receipt/snapshot reconciled | E2E | P0 | M5 |
| NET-13 | Transport recovery succeeds or fails | Application snapshot fallback and DB convergence | INT/CHAOS | P0 | M5 |
| NET-14 | Redis outage/restart; presence unknown | Conservative degradation; no false forfeit/ghost seat | CHAOS | P0 | M5 |
| NET-15 | Abrupt replica crash / lease expiry | Sweeper cleanup and correct sync; detection time recorded | CHAOS | P0 | M5 |
| NET-16 | Large synthetic reconnect storm | Jitter, bounded admission, recovery, no corruption | LOAD/CHAOS | P1 | M5 |
| NET-17 | Latency, jitter, loss, reordered app messages | Clear pending, bounded retry, monotonic convergence | E2E/CHAOS | P0 | M5 |
| NET-18 | Reconnect exactly at expiry timestamp | Strict documented cutoff; deterministic outcome | INT | P0 | M5 |
| NET-19 | Both reconnect on time but presence worker is delayed | No incorrect abandonment; authoritative recorded episodes honored | INT/CHAOS | P0 | M5 |
| NET-20 | Redis limiter unavailable but DB healthy | Conservative admission; correctness preserved; no false forfeit | CHAOS | P0 | M5 |
| NET-21 | Node drain during heartbeat and active action | Controlled reconnect, in-flight commit preserved; no stale lease overwrite | CHAOS | P0 | M5 |
| NET-22 | Client transport connects before authorization/snapshot | Not interactive/ready until required authorization and sync | E2E/INT | P0 | M5 |
| NET-23 | Reconnect loops exceed normal rate window | Bounded recovery allowance and jitter; no infinite request storm | LOAD/CHAOS | P1 | M5 |
| NET-24 | Lose reliable presence history across a deadline, then restore service | No forfeit from the gap. Resume if both are present, or give each still-absent seat a fresh grace. An unrecoverable match requires audited technical cancellation without a winner. | CHAOS | P0 | M5 |
| NET-25 | Resume before a disconnect cutoff with both players verified, then advance the active idle clock | The stored next seat and board resume. The previous idle job is stale. The new ten-minute idle clock starts at confirmed resume. | INT | P0 | M5 |

<a id="end"></a>

## END · Outcomes, series and rematches

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| END-01 | Natural win in each game | Personalized win/loss; correct final board and lines | E2E/INT | P0 | M4 |
| END-02 | Draw | Both see draw; one draw result; no winner | E2E/INT | P0 | M4 |
| END-03 | Cancel resign dialog | No resign command; game continues | E2E | P0 | M4 |
| END-04 | Confirm resign in ACTIVE or PAUSED | Opponent wins once; no fabricated winning line | INT/E2E | P0 | M4 |
| END-05 | Active idle reaches timeout | ABANDONED/no winner; race with valid action serialized | INT | P0 | M4 |
| END-06 | One player consents to rematch | Other notified; Start remains disabled | E2E | P0 | M4 |
| END-07 | Both consent and host starts | New match ID, clean board, swapped roles/starter, old result unchanged | INT/E2E | P0 | M4 |
| END-08 | Independently exercise decline, explicit leave and temporary disconnect after one rematch consent | Decline or leave clears consents. A disconnect disables Start and retains consent during valid grace for an unchanged roster. | INT/E2E | P0 | M4 |
| END-09 | Duplicate rematch Start or guest starts | One match or deny; host and consent enforced | INT/SEC | P0 | M4 |
| END-10 | Guest leaves after finish; different guest joins | Lobby/invite restored; new series identity and correct score | E2E | P0 | M4 |
| END-11 | Duplicate terminal event or replay/history request | One outcome/score; correct history | INT | P0 | M4 |
| END-12 | Abandonment or technical cancellation | Transparent reason/no winner; return to eligible lobby | E2E | P0 | M4 |
| END-13 | Host explicitly leaves after the result while the guest is viewing the room | Room closes, the guest is notified and both authenticated original participants can still read their own terminal projections during retention. | INT/E2E | P0 | M4 |
| END-14 | Repeat identical consent, then target an older match or previous series | An identical retry has one effect. A stale or wrong-series consent cannot enable rematch Start. | INT | P0 | M4 |
| END-15 | Resign races natural winning action on two replicas | Outcome follows first valid terminal commit; only one winner/result | INT/CHAOS | P0 | M5 |
| END-16 | Return to the lobby with the same roster after ABANDONED and let the host Start with both seats present | Create a new match with a fresh starter draw and clear board. Consent from the abandoned round has no effect. Existing series totals are preserved. | INT/E2E | P0 | M4 |
| END-17 | After a guest leaves, join a replacement and request room history and the previous terminal deep link as each guest | Replacement sees only their own matches and no previous private pointer. Original guest can read their own final projection with a valid session during retention. | SEC/INT | P0 | M4 |
| END-18 | A paused match finishes while one seat is absent. Process both the old match job and the new lobby job | The old job cannot change the result or evict a lobby seat. Lobby grace begins at match completion and its own expiry applies guest-release or host-close policy. | INT/CHAOS | P0 | M5 |

<a id="ux"></a>

## UX · Player journeys and localization

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| UX-01 | All screens at 320/390/768/1024/1440 and landscape | Correct board and visible CTA; no unintended horizontal overflow | VIS/E2E | P0 | M6 |
| UX-02 | EN/FA and switch language mid-match | Correct RTL and strings; canonical coordinates unchanged | VIS/E2E | P0 | M6 |
| UX-03 | Light/dark/system switch mid-match | Consistent tokens/contrast; no game reset | VIS/E2E | P0 | M6 |
| UX-04 | Keyboard-only create/join/start/play/rematch | Logical focus, legal keyboard actions, no unexpected trap | A11Y/E2E | P0 | M6 |
| UX-05 | Open rules/resign modal, press Escape/close | Focus trap and restore; no accidental resign | A11Y/E2E | P0 | M6 |
| UX-06 | Screen-reader turn/join/pause/result | Useful non-spam announcements; not color/sound dependent | A11Y | P0 | M6 |
| UX-07 | Color-vision simulation, grayscale, contrast, 200% zoom | Distinct pieces, readable text and nontext controls | A11Y/VIS | P0 | M6 |
| UX-08 | Reduced motion or low-powered device | No essential information lost; no strobe; correct state | VIS/E2E | P0 | M6 |
| UX-09 | Sound default and blocked audio permission | Muted by default; explicit toggle; visual feedback always | E2E | P1 | M6 |
| UX-10 | Slow network, pending, invalid move, failed copy | Accurate feedback, working recovery, no unhandled error | E2E | P0 | M6 |
| UX-11 | Long mixed Persian/English name and mobile safe area | No clipping/overlap/spoofing; readable labels | VIS/SEC | P0 | M6 |
| UX-12 | Drop animation followed by resync/rematch | Actual landing row; old animation never obscures new state | E2E | P0 | M6 |
| UX-13 | Paired usability tasks or expert walkthrough | Findings and evidence recorded; invitation, turn, rematch understood | UX | P1 | M6 |
| UX-14 | Give both seats the same mixed-script name and switch between English and Persian during play | The local You label, piece motif and role distinguish the seats. Coordinate announcements remain one-based and the physical board stays fixed. | A11Y/E2E | P0 | M6 |

<a id="des"></a>

## DES · Art direction and visual design

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| DES-01 | Review three complete design directions | Evidence-based comparison and coherent selected identity | UX/VIS | P1 | M1 |
| DES-02 | Inspect catalog, invite, host/guest lobby, both games, pause and result concepts | All core states have readable desktop/mobile references, not just hero | VIS | P1 | M1 |
| DES-03 | Compare implemented screens with references | Typography, hierarchy, tokens, geometry and spacing match; discrepancies tracked | VIS | P1 | M6 |
| DES-04 | Inspect original logo, board graphics, avatars, thumbnails and license inventory | Original coherent 2D art, verified rights, no copied trade dress | VIS/STATIC | P1 | M1 |
| DES-05 | Compare primary CTA across lobby states | One clear action, disabled reason, guest never sees functional Start | UX/VIS | P0 | M6 |
| DES-06 | Inspect player A/B pieces in both themes and grayscale at 320px | Distinct motifs and shapes; no color-only distinction | VIS/A11Y | P0 | M6 |
| DES-07 | Review semantic success/error versus piece colors | Meaning conveyed by text/icon/shape, no player inherently coded as loser | VIS/A11Y | P1 | M6 |
| DES-08 | Review every text/interactive token pair and focus ring | Documented contrast targets and measured failures fixed | A11Y/VIS | P0 | M1 |
| DES-09 | Inspect board ratio and cell alignment at unusual widths | Exact 3x3 or 7x6 geometry, no distortion | VIS | P0 | M6 |
| DES-10 | Inspect all reusable component states in gallery | Default, hover, pressed, focus, loading, disabled, error and themes covered | VIS | P1 | M6 |
| DES-11 | Test a 1920px wide desktop | Board remains dominant and readable; no excessive stretch | VIS | P1 | M6 |
| DES-12 | Test 360px/430px phone, landscape short viewport | Critical actions and board visible/reachable; natural vertical scroll | VIS/E2E | P1 | M6 |
| DES-13 | Open nickname form with mobile virtual keyboard | Field and submit accessible; no overlay clipping | E2E | P1 | M6 |
| DES-14 | Inspect 7 column controls at 320px | No overlap; documented minimum target/spacing; entire column usable | A11Y/VIS | P0 | M6 |
| DES-15 | Review translated errors, labels, long names and pluralization | No raw keys or misleading truncation; fluent-language review documented | UX/VIS | P0 | M6 |
| DES-16 | Test system theme at initial load with saved override | No disruptive flash; correct preference; no private state in storage | E2E | P1 | M6 |
| DES-17 | Inspect all SVG assets and decorative alt text | Optimized safe vector art; meaningful descriptions only where needed | A11Y/SEC | P1 | M6 |
| DES-18 | Review win/loss/draw/forfeit copy | Respectful personalized result, truthful reason, no guilt or manipulative pressure | UX | P1 | M6 |
| DES-19 | Review visible interactive affordances | Every control works or is honestly disabled; no mock data in live UI | E2E/UX | P0 | M6 |
| DES-20 | Inspect reduced-motion transition endpoints | Final board and state exact; no confetti/strobe/obsolete movement | VIS/E2E | P1 | M6 |

<a id="a11"></a>

## A11 · Accessibility and input

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| A11-01 | Screen reader inspects TTT occupied and empty cells | Coordinates, occupancy and role announced; legal activation only | A11Y | P0 | M6 |
| A11-02 | Screen reader inspects FIR columns and board summary | Full/available status and meaningful board access; no 42 unnecessary tab stops | A11Y | P0 | M6 |
| A11-03 | Arrow navigation and Enter/Space across board edges | Logical focus bounded, no wrap unless documented; one legal action | A11Y/E2E | P0 | M6 |
| A11-04 | Opponent move arrives while focus on board | Focus retained; turn announced once, not lost to rerender | A11Y/E2E | P0 | M6 |
| A11-05 | Countdown ticks in pause banner | No screen-reader announcement every second; important change announced | A11Y | P0 | M6 |
| A11-06 | Forced-colors/high contrast mode | Controls, focus, pieces and win state distinguishable | A11Y/VIS | P0 | M6 |
| A11-07 | Zoom/reflow equivalent narrow viewport | Critical text/actions readable without unintended horizontal scroll | A11Y | P0 | M6 |
| A11-08 | Hover absent on touch device | Legal drop/place still discoverable; no hover-only affordance | A11Y/E2E | P0 | M6 |
| A11-09 | Navigate via browser Back and forward | No automatic resign/leave; recovery and focus intentional | E2E/A11Y | P0 | M6 |
| A11-10 | Dialog content tall with 200% zoom | Scrollable content, focus remains visible, close reachable | A11Y | P0 | M6 |

<a id="sec"></a>

## SEC · Security and privacy

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| SEC-01 | Unauthorized Origin, CSRF, forged cookie | HTTP/WS deny; no mutation | SEC | P0 | M6 |
| SEC-02 | Other-room user reads/subscribes/actions | Deny; no private message or state | SEC | P0 | M6 |
| SEC-03 | Revoke session with open socket | Subsequent access denied; no stale privilege | SEC/INT | P0 | M6 |
| SEC-04 | Invite brute-force/preview spam | Distributed limiting and safe errors; legitimate shared NAT tested | SEC/LOAD | P0 | M6 |
| SEC-05 | XSS, SQL-like strings, oversized input | Escaped output, parameterized queries, bounded reject | SEC | P0 | M6 |
| SEC-06 | Inspect logs, analytics, frontend bundle and git | No raw invite/session/DB secrets/hidden data | SEC | P0 | M6 |
| SEC-07 | Submit a player command with a forged role, score, time, turn or result field | Strict schema rejects the extra fields. The prior board, version and outcome remain authoritative. | SEC | P0 | M6 |
| SEC-08 | Queued event races permission revoke | Delivery authorization/fencing; no later unauthorized private send | SEC/CHAOS | P0 | M6 |
| SEC-09 | Dependency and threat-model review | Exploitable high/critical issues fixed or explicit accountable exception | SEC | P0 | M6 |
| SEC-10 | Join page includes fragment token; inspect referrer/log/analytics | No fragment secret transmitted except intended POST; removed after join | SEC/E2E | P0 | M6 |
| SEC-11 | Private room/match response through proxy cache | No-store, no cross-user cached data | SEC/INT | P0 | M6 |
| SEC-12 | Hidden-info test plugin legal-actions/errors/events inspected | No opponent-only data, hidden RNG or raw state leak | SEC/UNIT | P0 | M6 |
| SEC-13 | Untrusted SVG/asset or third-party script review | Unsafe scripts rejected; asset/license pipeline verified | SEC/STATIC | P0 | M6 |
| SEC-14 | Inspect production build for test fixtures/debug endpoints | No test-only game, admin seed route, secret or mock exposed | SEC/STATIC | P0 | M6 |
| SEC-15 | Slow consumer exceeds buffer/subscription/frame limit | Bounded disconnect/resync or reject; healthy users unaffected | SEC/LOAD | P0 | M6 |
| SEC-16 | Session token rotation/revocation and old socket reconnect | Old credential rejected; authorized renewal policy correct | SEC/INT | P0 | M6 |

<a id="arch"></a>

## ARCH · Extensibility and contracts

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| ARCH-01 | Register test-only game with 3/4 seats | Same create/join/start flow, correct capacity, no core rewrite | INT | P0 | M4 |
| ARCH-02 | Test-only hidden state and multiple eligible seats | Per-seat projection; no leak in HTTP/WS/logs | UNIT/INT | P0 | M4 |
| ARCH-03 | Unknown rules/schema/action version | Safe reject; no silent fallback or corruption | UNIT/INT | P0 | M2 |
| ARCH-04 | Static dependency check | Pure rules; no game-name switch/two-seat assumption in core | STATIC | P0 | M2 |

<a id="ops"></a>

## OPS · Operations and capacity

| ID | Given / when | Expected acceptance criteria | Layer | Priority | Milestone |
|---|---|---|---|---|---|
| OPS-01 | Fresh clone, Compose, migrate | Documented startup; two replicas, DB/Redis/worker ready | INT | P0 | M3 |
| OPS-02 | Rolling deploy or stop API during match | Recover; committed moves and pinned game version preserved | CHAOS | P0 | M5 |
| OPS-03 | DB unavailable/transaction abort | No false durable ACK or partial write; safe degraded recovery | CHAOS | P0 | M5 |
| OPS-04 | Stop/restart outbox/deadline worker | Backlog drains; stale jobs harmless; metrics/alert verified | CHAOS | P0 | M5 |
| OPS-05 | Backup restore and expand-contract migration | Synthetic data restored/replayed; actual RPO/RTO evidence | OPS | P0 | M6 |
| OPS-06 | Steady authorized baseline/growth load | Latency/error targets assessed; convergence and invariants verified | LOAD | P1 | M5 |
| OPS-07 | Stress/spike/soak/reconnect/slow consumer | Bounded queues; no lost committed actions; safe limit documented | LOAD | P1 | M5 |
| OPS-08 | Synthetic metric/log/trace/alert trigger | Useful bounded-cardinality signal; no secrets; runbook actionable | OPS | P1 | M5 |
| OPS-09 | Retention cleanup during join/action/load | No active deletion; bounded work and measured lock/pool effects | INT/LOAD | P0 | M5 |
| OPS-10 | Kill outbox worker after publish before mark | Duplicate possible, one logical effect, retry and backlog metrics | CHAOS | P0 | M5 |
| OPS-11 | Worker lease expires and stale claimant resumes | Fencing prevents invalid completion of another worker's claim | CHAOS | P0 | M5 |
| OPS-12 | Measure DB pool across multiple replicas/workers | Total bounded under configured budget; no per-socket connection | LOAD/OPS | P1 | M5 |
| OPS-13 | Measure public catalog separately from gameplay workload | CDN/cache behavior and actual RPS separate; private no-store | LOAD | P1 | M5 |
| OPS-14 | Record offered load, delivered views and resource use at an authorized capacity stage | Report measured bandwidth, RSS, file descriptors and handshake CPU for that stage. Identify growth and stretch stages still unmeasured. | LOAD | P1 | M5 |
| OPS-15 | Roll out incompatible client/game version intentionally in staging | Safe compatibility handling; pinned old match still readable/playable | CHAOS | P0 | M5 |
| OPS-16 | Readiness fails during temporary dependency outage | No unsafe admission; liveness behavior as documented; recovery works | CHAOS | P0 | M5 |
| OPS-17 | Verify exact build/migration/CI/test scripts from clean checkout | Reproducible commands and real logs; no invented PASS | OPS/STATIC | P0 | M6 |
| OPS-18 | Measure p95/p99, sample counts and errors by category | Report against explicit workload, no averaging percentiles or fabricated capacity | LOAD | P1 | M5 |
| OPS-19 | Inspect deploy/runbook and kill switch for new matches | Safe operator controls, no loss of active state; rollback documented | OPS | P1 | M6 |
| OPS-20 | Retention/deletion versus long retry and active match | Preserve required tombstones/replay until policy permits; no resurrection | INT/OPS | P0 | M5 |
| OPS-21 | Review a synthetic availability interval containing a successful journey, a failed journey and a missing probe | Report good, failed and missing minutes with coverage. Withhold the monthly claim when unknown minutes could exhaust the error budget. | OPS | P1 | M6 |
