# 0001 · One workspace with separate service entry points

Tablemate uses TypeScript across pnpm workspace packages. React and Vite build the static client. NestJS exposes the HTTP API and Socket.IO exposes live commands and subscriptions. PostgreSQL persists the state. Redis Streams moves cross-replica signals. A separate worker processes background work.

The game registry dispatches by game and pinned rules version. Pure rules are workspace libraries so they can run independently of HTTP, browser and database. The memory fixture provides fast feedback for explicitly isolated single-process development. Durable integration evidence requires PostgreSQL.

Local Compose places the client and API behind one origin. Socket.IO uses WebSocket transport for replica testing through the reverse proxy. Use the PostgreSQL/Redis profile when testing concurrency, durability or multi-process recovery. Record the tested workload before making a capacity claim.
