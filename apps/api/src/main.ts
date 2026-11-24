import 'reflect-metadata';
import { randomBytes, randomUUID } from 'node:crypto';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ExpressAdapter } from '@nestjs/platform-express';
import { createAdapter } from '@socket.io/redis-streams-adapter';
import express, { type Request, type Response, type NextFunction } from 'express';
import { createClient } from 'redis';
import { Server, type Socket } from 'socket.io';
import { z } from 'zod';
import { commandIdSchema, nicknameSchema, versionSchema } from '@tablemate/contracts';
import { AppError, Application, catalog } from './application.js';
import { openStore } from './store.js';

class ApiModule {}
Module({})(ApiModule);

const production = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);
const origins = new Set((process.env.PUBLIC_ORIGIN ?? (production ? '' :
  'http://localhost:3000,http://127.0.0.1:3000,http://localhost:5173,http://127.0.0.1:5173,http://localhost:8080,http://127.0.0.1:8080')).split(',').filter(Boolean).map((value) => new URL(value.trim()).origin));
const defaultOrigin = origins.values().next().value;
if (!defaultOrigin) throw new Error('PUBLIC_ORIGIN must specify the browser origin');
const encryptKey = process.env.SESSION_REPLAY_KEY;
if (!encryptKey || encryptKey.length < 32) {
  if (production || process.env.DATABASE_URL) throw new Error('SESSION_REPLAY_KEY must be at least 32 characters');
}
const store = openStore();
const app = new Application(store, encryptKey ?? randomBytes(32).toString('hex'));
const nodeId = randomUUID();
const redis = process.env.REDIS_URL ? createClient({ url: process.env.REDIS_URL, socket: { connectTimeout: 3_000, reconnectStrategy: (retries) => Math.min(1_000, retries * 100) } }) : undefined;
if (production && !redis) throw new Error('REDIS_URL is required in production');
if (redis) {
  redis.on('error', () => console.error('Redis connection unavailable'));
  await redis.connect();
}
await app.heartbeat(nodeId);

const sessionName = production ? '__Host-tablemate_session' : 'tablemate_session';
const bootstrapName = production ? '__Host-tablemate_bootstrap' : 'tablemate_bootstrap';
const cookies = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
const secretSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const idSchema = z.uuid();
const emptySchema = z.strictObject({});
const roomCommandSchema = z.strictObject({ commandId: commandIdSchema, expectedRoomVersion: versionSchema });
const startSchema = roomCommandSchema.extend({ roomId: idSchema });
const resignBody = z.strictObject({ commandId: commandIdSchema, expectedVersion: versionSchema });
const actionBody = resignBody.extend({ action: z.unknown() }).refine((body) => body.action !== undefined);
const consentBody = roomCommandSchema.extend({ consent: z.boolean() });
const subscribeRoom = z.strictObject({ roomId: idSchema, lastKnownRoomVersion: versionSchema.optional() });
const subscribeMatch = z.strictObject({ matchId: idSchema, lastKnownStateVersion: versionSchema.optional() });

const validate = <T>(schema: z.ZodType<T>, payload: unknown): T => {
  const parsed = schema.safeParse(payload);
  if (!parsed.success) throw new AppError('VALIDATION_ERROR');
  return parsed.data;
};

function cookieValue(header: string | undefined, key: string) {
  const prefix = key + '=';
  const candidate = header?.split(';').map((encoded) => encoded.trim()).find((item) => item.startsWith(prefix))?.slice(prefix.length);
  const parsed = secretSchema.safeParse(candidate);
  return parsed.success ? parsed.data : undefined;
}

function errorPayload(caught: unknown, commandId?: string) {
  const error = caught instanceof AppError ? caught : new AppError('SERVICE_UNAVAILABLE', undefined, 1_000);
  if (!(caught instanceof AppError)) console.error('Unhandled request failure', caught instanceof Error ? caught.name : typeof caught);
  return {
    status: error.http,
    body: {
      ok: false, code: error.code, commandId,
      retryable: error.http >= 429,
      currentVersion: error.currentVersion, retryAfterMs: error.retryAfterMs
    }
  };
}

const http = express();
http.disable('x-powered-by');
if (process.env.TRUST_PROXY === '1') http.set('trust proxy', 1);
http.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
    'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'Cache-Control': 'no-store'
  });
  if (production) res.set('Strict-Transport-Security', 'max-age=31536000');
  if (req.path.startsWith('/api/v1') && !['GET', 'HEAD'].includes(req.method)) {
    if ((req.headers.origin && !origins.has(req.headers.origin)) || req.headers['sec-fetch-site'] === 'cross-site') {
      res.status(403).json({ ok: false, code: 'NOT_FOUND_OR_FORBIDDEN', retryable: false });
      return;
    }
    if (req.headers['sec-fetch-site'] && !req.headers.origin) {
      res.status(403).json({ ok: false, code: 'NOT_FOUND_OR_FORBIDDEN', retryable: false });
      return;
    }
  }
  next();
});
http.use(express.json({ limit: '8kb', strict: true }));

let draining = false;
let metricRequests = 0;
let metricErrors = 0;
let metricUpdates = 0;
const localLimits = new Map<string, { bucket: number; count: number }>();
async function throttle(key: string, maximum: number, duration = 60_000) {
  const now = Date.now();
  const bucket = Math.floor(now / duration);
  const prefixed = 'tablemate:limit:' + key + ':' + duration;
  let count: number;
  if (redis?.isReady) {
    count = Number(await redis.eval("local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('PEXPIRE',KEYS[1],ARGV[1]); end; return n;", {
      keys: [prefixed + ':' + bucket], arguments: [String(duration)]
    }));
  } else {
    if (redis && ['preview', 'guest', 'create', 'join'].some((kind) => key.startsWith(kind + ':'))) {
      throw new AppError('SERVICE_UNAVAILABLE', undefined, 1_000);
    }
    if (localLimits.size >= 12_000 && !localLimits.has(prefixed)) throw new AppError('RATE_LIMITED', undefined, duration);
    const previous = localLimits.get(prefixed);
    count = previous?.bucket === bucket ? previous.count + 1 : 1;
    localLimits.set(prefixed, { bucket, count });
  }
  if (count > maximum) throw new AppError('RATE_LIMITED', undefined, duration - now % duration);
}
const limiterCleanup = setInterval(() => localLimits.clear(), 120_000);
limiterCleanup.unref();

type Principal = Awaited<ReturnType<Application['authenticate']>>;
function principal(req: Request) { return app.authenticate(cookieValue(req.headers.cookie, sessionName)); }
function routeId(req: Request) { return validate(idSchema, req.params.id); }
function origin(req: Request) { return req.headers.origin && origins.has(req.headers.origin) ? req.headers.origin : defaultOrigin!; }
function ok(res: Response, data: unknown, status = 200) { res.status(status).json({ ok: true, data }); }
function confirmed(res: Response, commandId: string, data: { aggregateVersion: string }, status = 200) {
  const { aggregateVersion, ...view } = data;
  res.status(status).json({ ok: true, commandId, aggregateVersion, data: view });
}
type Route = (req: Request, res: Response) => Promise<void> | void;
function handle(action: Route) {
  return async (req: Request, res: Response) => {
    metricRequests++;
    try {
      if (draining) throw new AppError('SERVICE_UNAVAILABLE', undefined, 1_000);
      await action(req, res);
    }
    catch (error) {
      metricErrors++;
      const command = commandIdSchema.safeParse(req.body?.commandId);
      const failure = errorPayload(error, command.success ? command.data : undefined);
      if (failure.body.retryAfterMs) res.set('Retry-After', String(Math.ceil(failure.body.retryAfterMs / 1000)));
      res.status(failure.status).json(failure.body);
    }
  };
}

const api = express.Router();
api.post('/sessions/bootstrap', handle(async (req, res) => {
  validate(emptySchema, req.body ?? {});
  await throttle('guest:bootstrap:' + req.ip, 30);
  const existing = cookieValue(req.headers.cookie, bootstrapName);
  const proof = await app.issueBootstrap(existing);
  if (proof !== existing) res.cookie(bootstrapName, proof, { ...cookies, maxAge: 300_000 });
  ok(res, { expiresInMs: 300_000 });
}));
api.post('/sessions/guest', handle(async (req, res) => {
  const body = validate(z.strictObject({ commandId: commandIdSchema, nickname: nicknameSchema.optional() }), req.body);
  await throttle('guest:create:' + req.ip, 30);
  const issued = await app.guest(cookieValue(req.headers.cookie, bootstrapName), body.commandId, body.nickname, cookieValue(req.headers.cookie, sessionName));
  if (issued.issued) res.cookie(sessionName, issued.credential, { ...cookies, maxAge: 7 * 86_400_000 });
  ok(res, issued.principal);
}));
api.get('/me', handle(async (req, res) => { ok(res, await app.profile(await principal(req))); }));
api.patch('/me', handle(async (req, res) => {
  const body = validate(z.strictObject({ nickname: nicknameSchema }), req.body);
  ok(res, await app.rename(await principal(req), body.nickname));
}));
api.delete('/me/session', handle(async (req, res) => {
  await app.revoke(await principal(req));
  res.clearCookie(sessionName, cookies);
  res.clearCookie(bootstrapName, cookies);
  ok(res, null);
}));
api.post('/me/deletion-request', handle(async (req, res) => {
  validate(z.strictObject({ confirmed: z.literal(true) }), req.body);
  await app.revoke(await principal(req), true);
  res.clearCookie(sessionName, cookies);
  res.clearCookie(bootstrapName, cookies);
  ok(res, { status: 'PENDING' }, 202);
}));
api.get('/games', handle((_req, res) => {
  res.set('Cache-Control', 'public, max-age=60');
  ok(res, catalog());
}));
api.get('/games/:id', handle((req, res) => {
  const game = catalog().find((g) => g.id === req.params.id);
  if (!game) throw new AppError('NOT_FOUND_OR_FORBIDDEN');
  res.set('Cache-Control', 'public, max-age=60');
  ok(res, game);
}));
api.post('/rooms', handle(async (req, res) => {
  const body = validate(z.strictObject({ gameId: z.string().max(40), rulesVersion: z.number().int().positive().optional(), commandId: commandIdSchema }), req.body);
  const user = await principal(req);
  await throttle('create:' + user.principalId, 10);
  confirmed(res, body.commandId, await app.createRoom(user, body.gameId, body.rulesVersion, body.commandId, origin(req)), 201);
}));
api.post('/invites/preview', handle(async (req, res) => {
  await throttle('preview:' + req.ip, 30);
  const body = validate(z.strictObject({ token: secretSchema }), req.body);
  ok(res, await app.preview(body.token));
}));
api.post('/rooms/join', handle(async (req, res) => {
  const body = validate(z.strictObject({ token: secretSchema, commandId: commandIdSchema }), req.body);
  const user = await principal(req);
  await throttle('join:' + user.principalId, 20);
  confirmed(res, body.commandId, await app.join(user, body.token, body.commandId));
}));
api.get('/rooms/:id', handle(async (req, res) => { ok(res, await app.room(await principal(req), routeId(req))); }));
api.get('/rooms/:id/matches', handle(async (req, res) => { ok(res, await app.history(await principal(req), routeId(req))); }));
api.post('/rooms/:id/invitations/rotate', handle(async (req, res) => {
  const body = validate(roomCommandSchema, req.body);
  const user = await principal(req);
  await throttle('rotate:' + user.principalId, 12);
  confirmed(res, body.commandId, await app.rotate(user, routeId(req), body, origin(req)));
}));
api.post('/rooms/:id/leave', handle(async (req, res) => {
  const body = validate(roomCommandSchema, req.body);
  confirmed(res, body.commandId, await app.leave(await principal(req), routeId(req), body));
}));
api.post('/rooms/:id/start', handle(async (req, res) => {
  const body = validate(roomCommandSchema, req.body);
  confirmed(res, body.commandId, await app.start(await principal(req), routeId(req), body));
}));
api.get('/matches/:id', handle(async (req, res) => { ok(res, await app.match(await principal(req), routeId(req))); }));
async function move(user: Principal, matchId: string, body: z.infer<typeof actionBody>) {
  await throttle('action:' + user.principalId, 10, 5_000);
  await throttle('action:' + user.principalId, 60);
  return app.action(user, matchId, body, 'action');
}
api.post('/matches/:id/actions', handle(async (req, res) => {
  const body = validate(actionBody, req.body);
  confirmed(res, body.commandId, await move(await principal(req), routeId(req), body));
}));
api.post('/matches/:id/resign', handle(async (req, res) => {
  const body = validate(resignBody, req.body);
  confirmed(res, body.commandId, await app.action(await principal(req), routeId(req), body, 'resign'));
}));
api.post('/matches/:id/rematch-consent', handle(async (req, res) => {
  const body = validate(consentBody, req.body);
  confirmed(res, body.commandId, await app.consent(await principal(req), routeId(req), body));
}));
http.use('/api/v1', api);
http.get('/health/live', (_req, res) => { ok(res, { status: 'live' }); });
http.get('/health/ready', async (_req, res) => {
  try {
    if (draining) throw new Error('Service draining');
    await store.healthy();
    if (redis && !redis.isReady) throw new Error('Redis unavailable');
    ok(res, { status: 'ready' });
  } catch { res.status(503).json({ ok: false, code: 'SERVICE_UNAVAILABLE' }); }
});
http.get('/metrics', (req, res) => {
  if (!process.env.METRICS_TOKEN || req.headers.authorization !== 'Bearer ' + process.env.METRICS_TOKEN) {
    res.sendStatus(404); return;
  }
  res.type('text/plain').send([
    'tablemate_http_requests_total ' + metricRequests,
    'tablemate_http_errors_total ' + metricErrors,
    'tablemate_socket_projection_total ' + metricUpdates,
    'tablemate_connected_sockets ' + io.sockets.sockets.size
  ].join('\n') + '\n');
});
http.use((_req, res) => { res.status(404).json({ ok: false, code: 'NOT_FOUND_OR_FORBIDDEN' }); });
http.use((error: {type?: string}, _req: Request, res: Response, _next: NextFunction) => {
  const status = error.type === 'entity.too.large' ? 413 : 400;
  res.status(status).json({ ok: false, code: 'VALIDATION_ERROR', retryable: false });
});

const nest = await NestFactory.create(ApiModule, new ExpressAdapter(http), { logger: ['error'], bodyParser: false });
const io = new Server(nest.getHttpServer(), {
  maxHttpBufferSize: 8_192,
  transports: ['websocket'],
  allowRequest: (request, cb) => cb(null, !draining && (!request.headers.origin || origins.has(request.headers.origin))),
  ...(redis ? { adapter: createAdapter(redis, { streamName: 'tablemate:socket:events' }) } : {})
});
type SocketSubscriptions = { roomId?: string; matchId?: string; matchRoomId?: string; leaseRooms: Set<string> };
type Ack = (payload: unknown) => void;

const roomListeners = new Map<string, Set<Socket>>();
function replaceListeners(socket: Socket, subs: SocketSubscriptions, roomId: string | undefined, matchRoomId: string | undefined) {
  const previous = new Set([subs.roomId, subs.matchRoomId]);
  const next = new Set([roomId, matchRoomId]);
  for (const id of previous) {
    if (!id || next.has(id)) continue;
    const listeners = roomListeners.get(id);
    listeners?.delete(socket);
    if (!listeners?.size) roomListeners.delete(id);
  }
  for (const id of next) {
    if (!id) continue;
    let listeners = roomListeners.get(id);
    if (!listeners) { listeners = new Set(); roomListeners.set(id, listeners); }
    listeners.add(socket);
  }
  subs.roomId = roomId;
  subs.matchRoomId = matchRoomId;
}
const identity = (socket: Socket) => app.authenticate(cookieValue(socket.request.headers.cookie, sessionName));
io.use(async (socket, next) => {
  try {
    await throttle('socket:' + socket.handshake.address, 100);
    await identity(socket);
    next();
  } catch (error) {
    // Socket.IO exposes structured handshake failure data to the caller.
    const failure = errorPayload(error);
    const connectError = new Error(failure.body.code) as Error & { data: unknown };
    connectError.data = failure.body;
    next(connectError);
  }
});

const queued = new Set<string>();
const sending = new Set<string>();
const backpressured = new WeakSet<Socket>();
function notify(roomId: string) {
  queued.add(roomId);
  if (sending.has(roomId)) return;
  sending.add(roomId);
  void flushRoom(roomId);
}

async function flushRoom(roomId: string) {
  try {
    while (queued.delete(roomId)) {
      const listeners = roomListeners.get(roomId);
      if (!listeners) return;
      for (const socket of [...listeners]) {
        const sub: SocketSubscriptions = socket.data.sub;
        if (!socket.conn.transport.writable) {
          if (!backpressured.has(socket)) {
            backpressured.add(socket);
            const transport = socket.conn.transport;
            const slow = setTimeout(() => socket.conn.close(), 5_000);
            const cleanup = () => {
              clearTimeout(slow);
              backpressured.delete(socket);
              transport.off('ready', onReady);
              socket.off('disconnect', cleanup);
            };
            const onReady = () => {
              cleanup();
              if (sub.roomId) notify(sub.roomId);
              if (sub.matchRoomId && sub.matchRoomId !== sub.roomId) notify(sub.matchRoomId);
            };
            // Engine.IO's socket drains its local write queue before the WebSocket becomes writable.
            transport.once('ready', onReady);
            socket.once('disconnect', cleanup);
          }
          continue;
        }
        try {
          const user = await identity(socket);
          if (sub.roomId === roomId) {
            try {
              const view = await app.room(user, roomId);
              socket.emit('room:updated', { eventId: randomUUID(), roomId, roomVersion: view.roomVersion, presenceRevision: view.presenceRevision, roomView: view, serverTime: view.serverTime });
              if (view.currentMatchId) socket.volatile.emit('match:started', { eventId: randomUUID(), roomId, roomVersion: view.roomVersion, matchId: view.currentMatchId, rulesVersion: view.rulesVersion });
              metricUpdates++;
            } catch (error) {
              if (!(error instanceof AppError) || error.code !== 'NOT_FOUND_OR_FORBIDDEN') throw error;
              socket.emit('room:closed', { roomId, reason: 'ROOM_UNAVAILABLE' });
              replaceListeners(socket, sub, undefined, sub.matchRoomId);
            }
          }
          if (sub.matchId && sub.matchRoomId === roomId) {
            const view = await app.match(user, sub.matchId);
            socket.emit('match:updated', { eventId: randomUUID(), matchId: view.matchId, stateVersion: view.stateVersion, playerView: view, status: view.status, result: view.result, serverTime: view.serverTime });
            metricUpdates++;
          }
        } catch (error) {
          const failure = errorPayload(error);
          if (failure.status === 401) {
            socket.emit('session:revoked');
            socket.disconnect(true);
          } else if (failure.status === 503) {
            socket.volatile.emit('system:degraded', { retryAfterMs: 1_000 });
          }
        }
      }
    }
  } finally { sending.delete(roomId); }
}

store.listen(notify, () => { for (const id of roomListeners.keys()) notify(id); });

io.on('connection', (socket) => {
  const sub: SocketSubscriptions = { leaseRooms: new Set() };
  socket.data.sub = sub;
  const link = { nodeId, connectionId: socket.id };
  const register = (name: string, run: (user: Principal, input: unknown) => Promise<unknown>, mutation = false) => {
    socket.on(name, async (input: unknown, ack?: Ack) => {
      if (typeof ack !== 'function' && !name.endsWith(':unsubscribe')) return;
      const respond = typeof ack === 'function' ? ack : () => {};
      try {
        const result = await run(await identity(socket), input);
        if (mutation) {
          const { aggregateVersion, ...data } = result as { aggregateVersion: string };
          respond({ ok: true, commandId: (input as { commandId: string }).commandId, aggregateVersion, data });
        } else respond({ ok: true, data: result });
      } catch (error) {
        const command = commandIdSchema.safeParse(input && (input as {commandId?: unknown}).commandId);
        const failure = errorPayload(error, command.success ? command.data : undefined);
        respond(failure.body);
        if (failure.status === 401) socket.disconnect(true);
      }
    });
  };
  register('room:subscribe', async (user, input) => {
    const body = validate(subscribeRoom, input);
    await throttle('sync:' + user.principalId, 30);
    const previous = sub.roomId;
    if (previous && previous !== body.roomId && previous !== sub.matchRoomId) {
      await app.disconnect(previous, link);
      sub.leaseRooms.delete(previous);
    }
    replaceListeners(socket, sub, body.roomId, sub.matchRoomId);
    try {
      const view = await app.subscribeRoom(user, body.roomId, link);
      sub.leaseRooms.add(body.roomId);
      return view;
    } catch (error) { replaceListeners(socket, sub, undefined, sub.matchRoomId); throw error; }
  });
  register('match:subscribe', async (user, input) => {
    const body = validate(subscribeMatch, input);
    await throttle('sync:' + user.principalId, 30);
    const view = await app.subscribeMatch(user, body.matchId, link);
    if (sub.matchRoomId && sub.matchRoomId !== view.roomId && sub.matchRoomId !== sub.roomId) {
      await app.disconnect(sub.matchRoomId, link);
      sub.leaseRooms.delete(sub.matchRoomId);
    }
    sub.matchId = body.matchId;
    sub.leaseRooms.add(view.roomId);
    replaceListeners(socket, sub, sub.roomId, view.roomId);
    notify(view.roomId);
    return view;
  });
  register('room:unsubscribe', async (_user, input) => {
    const body = validate(z.strictObject({ roomId: idSchema }), input);
    if (body.roomId === sub.roomId) {
      if (body.roomId !== sub.matchRoomId) {
        await app.disconnect(body.roomId, link);
        sub.leaseRooms.delete(body.roomId);
      }
      replaceListeners(socket, sub, undefined, sub.matchRoomId);
    }
    return null;
  });
  register('match:unsubscribe', async (_user, input) => {
    const body = validate(z.strictObject({ matchId: idSchema }), input);
    if (body.matchId === sub.matchId) {
      if (sub.matchRoomId && sub.matchRoomId !== sub.roomId) {
        await app.disconnect(sub.matchRoomId, link);
        sub.leaseRooms.delete(sub.matchRoomId);
      }
      sub.matchId = undefined;
      replaceListeners(socket, sub, sub.roomId, undefined);
    }
    return null;
  });
  register('state:sync', async (user, input) => {
    const body = validate(z.strictObject({ scope: z.enum(['room', 'match']), id: idSchema, lastKnownVersion: versionSchema.optional() }), input);
    await throttle('sync:' + user.principalId, 30);
    return body.scope === 'room' ? app.room(user, body.id) : app.match(user, body.id);
  });
  register('match:start', (user, input) => {
    const { roomId, ...body } = validate(startSchema, input);
    return app.start(user, roomId, body);
  }, true);
  register('game:action', (user, input) => {
    const { matchId, ...body } = validate(z.strictObject({ matchId: idSchema, commandId: commandIdSchema, expectedVersion: versionSchema, action: z.unknown() }), input);
    return move(user, matchId, body);
  }, true);
  register('match:resign', (user, input) => {
    const { matchId, ...body } = validate(resignBody.extend({ matchId: idSchema }), input);
    return app.action(user, matchId, body, 'resign');
  }, true);
  register('match:rematch_consent', (user, input) => {
    const { matchId, ...body } = validate(consentBody.extend({ matchId: idSchema }), input);
    return app.consent(user, matchId, body);
  }, true);
  let expiration: NodeJS.Timeout | undefined;
  void identity(socket).then((authenticated) => {
    if (socket.connected) {
      expiration = setTimeout(() => {
        socket.emit('session:revoked');
        socket.disconnect(true);
      }, Math.max(0, authenticated.sessionExpiry - Date.now()));
      expiration.unref();
    }
  }).catch(() => socket.disconnect(true));
  socket.once('disconnect', () => {
    clearTimeout(expiration);
    replaceListeners(socket, sub, undefined, undefined);
    for (const roomId of sub.leaseRooms) void app.disconnect(roomId, link).catch(() => console.error('Presence disconnect will be reconciled'));
  });
});

const recurring = (name: string, fn: () => Promise<void>, interval: number) => {
  let pending = false;
  return setInterval(() => {
    if (pending) return;
    pending = true;
    void fn().catch(() => console.error(name + ' failed; retry scheduled')).finally(() => { pending = false; });
  }, interval);
};
const heartbeat = recurring('Presence heartbeat', async () => {
  if (await app.heartbeat(nodeId)) {
    for (const socket of io.sockets.sockets.values()) socket.conn.close();
  }
}, 10_000);
const externalWorker = process.env.EXTERNAL_WORKER === '1';
const deadlines = externalWorker ? undefined : recurring('Deadline scan', () => app.tick(), 1_000);
const outbox = externalWorker ? undefined : recurring('Outbox publication', () => store.publishOutbox(), 150);
await nest.listen(port, '0.0.0.0');
console.log('Tablemate API listening on port ' + port);

async function close() {
  if (draining) return;
  draining = true;
  clearInterval(heartbeat);
  clearInterval(deadlines);
  clearInterval(outbox);
  clearInterval(limiterCleanup);
  for (const socket of io.sockets.sockets.values()) socket.conn.close();
  await new Promise<void>((resolve) => io.close(() => resolve()));
  await store.close();
  if (redis?.isOpen) await redis.quit();
}
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.once(signal, () => { void close().catch(() => { process.exitCode = 1; }); });
