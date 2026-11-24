# Realtime transport

Socket.IO connects over the same origin as HTTP and uses the session cookie. For direct local integration, the client supplies the permitted browser origin and its own cookie. Nginx forwards WebSocket upgrades and the original host.

| Event | Required data | Response |
|---|---|---|
| `room:subscribe` | `roomId` | Viewer-specific room snapshot |
| `match:subscribe` | `matchId` | Viewer-specific match snapshot |
| `state:sync` | `scope`, `id` | Latest authorized snapshot |
| `match:start` | `roomId`, `commandId`, `expectedRoomVersion` | Committed match ID and caller projection |
| `game:action` | `matchId`, `commandId`, `expectedVersion`, typed `action` | Committed caller projection |
| `match:resign` | `matchId`, `commandId`, `expectedVersion` | Terminal caller projection |
| `match:rematch_consent` | `matchId`, `commandId`, `expectedRoomVersion`, `consent` | Updated room projection |

Use UUID command IDs and decimal string versions. On a retry after an uncertain ACK, keep the original intent and expected version. Resync on conflict. An accepted ACK describes a durable commit. Remote delivery and reconnection are observed separately.

The server emits `room:updated` and `match:updated` with authorized full projections. `room:closed` carries a safe reason. `session:revoked` fences the connected client. Recovery applies a fresh snapshot, checks the aggregate ID and compares version components numerically. WebSocket delivery may be interrupted, so use the authoritative read to resolve uncertainty.
