import { createCipheriv, createDecipheriv, createHash, randomBytes, randomInt, randomUUID } from 'node:crypto';
import { getGame, games } from '@tablemate/game-registry';
import type { GameState } from '@tablemate/contracts';
import type { Store, Transaction } from './store.js';

const SECOND = 1_000;
const GRACE = 120 * SECOND;
const IDLE_MATCH = 10 * 60 * SECOND;
const IDLE_ROOM = 30 * 60 * SECOND;
const INVITE_TTL = 30 * 60 * SECOND;
const RECEIPT_TTL = 24 * 60 * 60 * SECOND;
const SESSION_TTL = 7 * 24 * 60 * 60 * SECOND;
const BOOTSTRAP_TTL = 5 * 60 * SECOND;
const NODE_TTL = 45 * SECOND;
const PRESENCE_TICK = 15 * SECOND;
const HISTORY_TTL = 90 * 24 * 60 * 60 * SECOND;
const token = () => randomBytes(32).toString('base64url');
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const iso = (date: number | null) => date === null ? null : new Date(date).toISOString();
const advance = (version: string) => (BigInt(version) + 1n).toString();
const earlier = (a: number | null, b: number | null) => a === null ? b : b === null ? a : Math.min(a, b);

const errors: Record<string, number> = {
  VALIDATION_ERROR: 400, UNAUTHENTICATED: 401, SESSION_EXPIRED: 401,
  NOT_HOST: 403, NOT_FOUND_OR_FORBIDDEN: 404, INVITATION_UNAVAILABLE: 410,
  RATE_LIMITED: 429, SERVICE_UNAVAILABLE: 503
};

export class AppError extends Error {
  readonly http: number;
  constructor(readonly code: string, readonly currentVersion?: string, readonly retryAfterMs?: number) {
    super(code);
    this.http = errors[code] ?? 409;
  }
}

type Principal = { principalId: string; nickname: string; sessionKey: string; sessionExpiry: number };
type Session = { principalId: string; expires: number; bootstrapKey: string };
type User = { nickname: string; played?: boolean };
type Connection = { nodeId: string; connectionId: string; observedAt?: number };
type NodeLease = { expires: number; continuousFrom: number };
type Seat = {
  seatId: string;
  principalId: string;
  nickname: string;
  isHost: boolean;
  connections: Connection[];
  due: number | null;
};
type Invitation = { roomId: string; expiry: number; active: boolean };
type Result = {
  kind: 'WIN' | 'DRAW' | 'ABANDONED';
  winnerSeatIds: readonly string[];
  reason: string;
  winningLines: readonly (readonly { row: number; col: number }[])[];
  terminalVersion: string;
};
type Match = {
  id: string;
  roomId: string;
  state: GameState;
  status: 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'ABANDONED';
  version: string;
  gameId: string;
  rulesVersion: number;
  stateSchemaVersion: number;
  roster: Omit<Seat, 'connections' | 'due'>[];
  roles: Record<string, string>;
  seriesId: string;
  idleDue: number | null;
  result: Result | null;
  finishedAt: number | null;
};
type Room = {
  id: string;
  gameId: string;
  rulesVersion: number;
  version: string;
  revision: string;
  status: 'OPEN' | 'PLAYING' | 'CLOSED' | 'EXPIRED';
  seats: Seat[];
  inviteKey: string | null;
  inviteExpiry: number | null;
  currentMatchId: string | null;
  lastMatchId: string | null;
  seriesId: string;
  series: { wins: Record<string, number>; draws: number };
  consents: string[];
  idleDue: number;
  closedAt?: number;
};
type Receipt = {
  fingerprint: string;
  expires: number;
  version: string;
  outcome: { roomId: string; matchId?: string };
};
type Bootstrap = { expires: number; replay?: { encrypted: string; commandId: string; nickname: string | null } };
type Command = { commandId: string; expectedRoomVersion?: string; expectedVersion?: string };

const isTerminal = (match: Match) => match.status === 'FINISHED' || match.status === 'ABANDONED';
const seatOf = (room: Room, principalId: string) => room.seats.find((s) => s.principalId === principalId);
const isConnected = (seat: Seat) => seat.connections.length > 0;
const ready = (room: Room) => room.status === 'OPEN' && room.seats.length === 2 && room.seats.every(isConnected);
const matchKey = (roomId: string, id: string) => roomId + '/' + id;
const receiptHash = (value: unknown): string => {
  const encode = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(encode);
    if (typeof v === 'object' && v !== null) return Object.fromEntries(Object.keys(v).sort().map((k) => [k, encode((v as Record<string, unknown>)[k])]));
    return v;
  };
  return hash(JSON.stringify(encode(value)));
};
function required<T>(value: T | null | undefined, code = 'NOT_FOUND_OR_FORBIDDEN'): T {
  if (value === undefined || value === null) throw new AppError(code);
  return value;
}

const descriptions: Record<string, { title: string; description: string }> = {
  'tic-tac-toe': { title: 'Tic-Tac-Toe', description: 'Line up three marks before your friend does.' },
  'four-in-a-row': { title: 'Four in a Row', description: 'Drop discs and connect four across, down, or diagonally.' }
};

export const catalog = () => games.flatMap((definition) => {
  const copy = descriptions[definition.id];
  if (!copy) return [];
  return [{ id: definition.id, ...copy, rulesVersion: definition.rulesVersion, stateSchemaVersion: definition.stateSchemaVersion, playerCount: 2 }];
});

export class Application {
  private readonly replayKey: Buffer;
  constructor(readonly store: Store, key: string) {
    this.replayKey = createHash('sha256').update(key).digest();
  }

  async issueBootstrap(existing?: string) {
    if (existing) {
      const key = hash(existing);
      const usable = await this.store.transaction('bootstrap:' + key, async (tx) => {
        const row = await tx.read<Bootstrap>('bootstraps', key);
        return !!row && row.expires > await tx.now();
      });
      if (usable) return existing;
    }
    const proof = token();
    const key = hash(proof);
    await this.store.transaction('bootstrap:' + key, async (tx) => {
      const expires = await tx.now() + BOOTSTRAP_TTL;
      await tx.put('bootstraps', key, { expires }, expires);
    });
    return proof;
  }

  private encryptCredential(secret: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.replayKey, iv);
    return Buffer.concat([iv, cipher.update(secret, 'utf8'), cipher.final(), cipher.getAuthTag()]).toString('base64url');
  }

  private decryptCredential(encoded: string): string {
    const data = Buffer.from(encoded, 'base64url');
    const decipher = createDecipheriv('aes-256-gcm', this.replayKey, data.subarray(0, 12));
    decipher.setAuthTag(data.subarray(data.length - 16));
    return Buffer.concat([decipher.update(data.subarray(12, data.length - 16)), decipher.final()]).toString();
  }

  private async verify(tx: Transaction, credential: string): Promise<Principal> {
    const sessionKey = hash(credential);
    const session = await tx.read<Session>('sessions', sessionKey);
    if (!session || session.expires <= await tx.now()) throw new AppError('SESSION_EXPIRED');
    const user = required(await tx.read<User>('users', session.principalId), 'SESSION_EXPIRED');
    return { principalId: session.principalId, nickname: user.nickname, sessionKey, sessionExpiry: session.expires };
  }

  async authenticate(credential?: string): Promise<Principal> {
    if (!credential) throw new AppError('UNAUTHENTICATED');
    return this.store.transaction('session:' + hash(credential), (tx) => this.verify(tx, credential));
  }

  private async authorized(tx: Transaction, principal: Principal) {
    const session = await tx.read<Session>('sessions', principal.sessionKey);
    if (!session || session.principalId !== principal.principalId || session.expires <= await tx.now()) {
      throw new AppError('SESSION_EXPIRED');
    }
  }

  async guest(bootstrap: string | undefined, commandId: string, nickname?: string, credential?: string) {
    if (credential) {
      const current = await this.authenticate(credential).catch((error: unknown) => {
        if (error instanceof AppError && error.code === 'SESSION_EXPIRED') return null;
        throw error;
      });
      if (current) return { principal: await this.profile(current), credential, issued: false };
    }
    if (!bootstrap) throw new AppError('VALIDATION_ERROR');
    const key = hash(bootstrap);
    return this.store.transaction('bootstrap:' + key, async (tx) => {
      const now = await tx.now();
      const previous = await tx.read<Bootstrap>('bootstraps', key);
      if (!previous || previous.expires <= now) throw new AppError('COMMAND_EXPIRED');
      if (previous.replay) {
        if (previous.replay.commandId !== commandId || previous.replay.nickname !== (nickname ?? null)) throw new AppError('COMMAND_ID_REUSED');
        const original = this.decryptCredential(previous.replay.encrypted);
        const principal = await this.verify(tx, original);
        const activeRoomId = await tx.read<string>('memberships', principal.principalId);
        return { principal: { principalId: principal.principalId, nickname: principal.nickname, activeRoomId: activeRoomId ?? null }, credential: original, issued: true };
      }
      const principalId = randomUUID();
      const name = nickname ?? 'Guest ' + randomInt(1000, 10_000);
      const secret = token();
      await tx.put('users', principalId, { nickname: name });
      await tx.put('sessions', hash(secret), { principalId, expires: now + SESSION_TTL, bootstrapKey: key }, now + SESSION_TTL);
      await tx.put('bootstraps', key, { expires: previous.expires, replay: { encrypted: this.encryptCredential(secret), commandId, nickname: nickname ?? null } }, previous.expires);
      return { principal: { principalId, nickname: name, activeRoomId: null }, credential: secret, issued: true };
    });
  }

  async profile(principal: Principal) {
    return this.store.transaction('user:' + principal.principalId, async (tx) => {
      await this.authorized(tx, principal);
      const user = required(await tx.read<User>('users', principal.principalId), 'SESSION_EXPIRED');
      const activeRoomId = await tx.read<string>('memberships', principal.principalId);
      return { principalId: principal.principalId, nickname: user.nickname, activeRoomId: activeRoomId ?? null };
    });
  }

  async rename(principal: Principal, nickname: string) {
    const activeRoomId = (await this.profile(principal)).activeRoomId;
    return this.store.transaction(activeRoomId ? 'room:' + activeRoomId : 'user:' + principal.principalId, async (tx) => {
      await this.authorized(tx, principal);
      const user = required(await tx.read<User>('users', principal.principalId), 'SESSION_EXPIRED');
      const membership = await tx.read<string>('memberships', principal.principalId);
      if (user.played || (membership ?? null) !== activeRoomId) throw new AppError('MATCH_ALREADY_STARTED');
      await tx.put('users', principal.principalId, { ...user, nickname });
      if (activeRoomId) {
        const room = required(await tx.read<Room>('rooms', activeRoomId));
        required(seatOf(room, principal.principalId)).nickname = nickname;
        room.version = advance(room.version);
        await this.saveRoom(tx, room, null, await tx.now());
      }
      return { principalId: principal.principalId, nickname, activeRoomId };
    });
  }

  async revoke(principal: Principal, deletion = false) {
    await this.store.transaction('session:' + principal.sessionKey, async (tx) => {
      await this.authorized(tx, principal);
      if (deletion) {
        await tx.put('deletion_requests', principal.principalId, { requested: await tx.now(), state: 'PENDING' });
      }
      const session = required(await tx.read<Session>('sessions', principal.sessionKey), 'SESSION_EXPIRED');
      await tx.remove('bootstraps', session.bootstrapKey);
      await tx.remove('sessions', principal.sessionKey);
      const roomId = await tx.read<string>('memberships', principal.principalId);
      if (roomId) await tx.emit(roomId);
    });
  }

  private async validReceipt(tx: Transaction, principal: Principal, scope: string, commandId: string, body: unknown, now: number) {
    const key = principal.principalId + '/' + scope + '/' + commandId;
    const fingerprint = receiptHash(body);
    const existing = await tx.read<Receipt>('receipts', key);
    if (existing) {
      if (existing.fingerprint !== fingerprint) throw new AppError('COMMAND_ID_REUSED');
      if (existing.expires <= now) throw new AppError('COMMAND_EXPIRED');
    }
    return { key, fingerprint, existing };
  }

  private async saveReceipt(tx: Transaction, entry: { key: string; fingerprint: string }, now: number, version: string, outcome: Receipt['outcome']) {
    await tx.put('receipts', entry.key, { fingerprint: entry.fingerprint, expires: now + RECEIPT_TTL, version, outcome }, now + SESSION_TTL);
  }

  private async issueInvite(tx: Transaction, room: Room, now: number) {
    const secret = token();
    await this.invalidateInvite(tx, room);
    room.inviteKey = hash(secret);
    room.inviteExpiry = now + INVITE_TTL;
    await tx.put('invites', room.inviteKey, { roomId: room.id, expiry: room.inviteExpiry, active: true }, now + HISTORY_TTL);
    return secret;
  }

  private async invalidateInvite(tx: Transaction, room: Room) {
    if (!room.inviteKey) return;
    const invite = await tx.read<Invitation>('invites', room.inviteKey);
    if (invite) await tx.put('invites', room.inviteKey, { ...invite, active: false }, await tx.now() + HISTORY_TTL);
    room.inviteKey = null;
    room.inviteExpiry = null;
  }

  private async release(tx: Transaction, room: Room, seat: Seat, now: number, closing: Room['status'] = 'CLOSED') {
    await this.invalidateInvite(tx, room);
    room.consents = [];
    room.seriesId = randomUUID();
    room.series = { wins: {}, draws: 0 };
    room.idleDue = now + IDLE_ROOM;
    const departing = seat.isHost ? room.seats : [seat];
    for (const leaving of departing) await tx.remove('memberships', leaving.principalId);
    room.seats = seat.isHost ? [] : room.seats.filter((candidate) => candidate !== seat);
    if (seat.isHost) { room.status = closing; room.closedAt = now; }
    room.version = advance(room.version);
    room.revision = advance(room.revision);
  }

  private async saveRoom(tx: Transaction, room: Room, match: Match | null, now: number) {
    let due: number | null = null;
    if (room.status === 'OPEN' || room.status === 'PLAYING') {
      due = room.status === 'OPEN' ? room.idleDue : match?.idleDue ?? null;
      for (const seat of room.seats) {
        due = earlier(due, seat.due);
        if (isConnected(seat)) due = earlier(due, now + PRESENCE_TICK);
      }
    } else due = (room.closedAt ?? now) + HISTORY_TTL;
    await tx.put('rooms', room.id, room, due ?? undefined);
    await tx.emit(room.id);
  }

  private async saveTransition(tx: Transaction, match: Match, kind: string, now: number, detail?: unknown) {
    await tx.put('matches', match.id, match, match.finishedAt === null ? undefined : match.finishedAt + HISTORY_TTL);
    await tx.put('match_actions', matchKey(match.id, match.version), { kind, at: now, detail }, match.finishedAt === null ? undefined : match.finishedAt + HISTORY_TTL);
  }

  private outcome(kind: Result['kind'], reason: string, winners: readonly string[], version: string, winningLines: Result['winningLines'] = []): Result {
    return { kind, reason, winnerSeatIds: winners, winningLines, terminalVersion: version };
  }

  private async finish(tx: Transaction, room: Room, match: Match, result: Result, now: number, kind: string, detail?: unknown) {
    match.status = result.kind === 'ABANDONED' ? 'ABANDONED' : 'FINISHED';
    match.version = result.terminalVersion;
    match.result = result;
    match.finishedAt = now;
    match.idleDue = null;
    room.status = 'OPEN';
    room.currentMatchId = null;
    room.lastMatchId = match.id;
    room.consents = [];
    room.idleDue = now + IDLE_ROOM;
    room.version = advance(room.version);
    for (const seat of room.seats) {
      if (!isConnected(seat)) seat.due = now + GRACE;
    }
    if (result.kind === 'DRAW') room.series.draws++;
    for (const winner of result.winnerSeatIds) room.series.wins[winner] = (room.series.wins[winner] ?? 0) + 1;
    await this.saveTransition(tx, match, kind, now, detail);
  }

  private async expire(tx: Transaction, room: Room, match: Match | null, now: number): Promise<boolean> {
    if (room.status === 'OPEN') {
      const due = room.seats.filter((s) => s.due !== null && s.due <= now).sort((a, b) => a.due! - b.due! || Number(b.isHost) - Number(a.isHost));
      const host = room.seats.find((seat) => seat.isHost);
      if (room.idleDue <= now && room.idleDue <= (due[0]?.due ?? Infinity) && host) {
        await this.release(tx, room, host, now, 'EXPIRED');
        return true;
      }
      for (const seat of due) {
        if (room.status !== 'OPEN') break;
        await this.release(tx, room, seat, now);
      }
      return due.length > 0;
    }
    if (!match || isTerminal(match)) return false;
    if (match.status === 'ACTIVE' && match.idleDue !== null && match.idleDue <= now) {
      const result = this.outcome('ABANDONED', 'IDLE_TIMEOUT', [], advance(match.version));
      await this.finish(tx, room, match, result, now, 'IDLE_TIMEOUT');
      return true;
    }
    if (match.status === 'PAUSED' && room.seats.some((s) => s.due !== null && s.due <= now)) {
      const present = room.seats.filter(isConnected);
      const result = present.length === 1
        ? this.outcome('WIN', 'DISCONNECT_FORFEIT', [present[0].seatId], advance(match.version))
        : this.outcome('ABANDONED', 'BOTH_ABSENT', [], advance(match.version));
      await this.finish(tx, room, match, result, now, result.reason);
      return true;
    }
    return false;
  }

  private async reconcileNodes(tx: Transaction, room: Room, match: Match | null, now: number) {
    let changed = false;
    const leases = new Map<string, NodeLease | null>();
    for (const seat of room.seats) {
      if (!isConnected(seat)) continue;
      const live: Connection[] = [];
      for (const connection of seat.connections) {
        if (connection.nodeId === 'fixture') {
          live.push(connection);
          continue;
        }
        if (!leases.has(connection.nodeId)) {
          const lease = await tx.read<NodeLease | number>('nodes', connection.nodeId);
          leases.set(connection.nodeId, typeof lease === 'number' ? { expires: lease, continuousFrom: 0 } : lease ?? null);
        }
        const lease = leases.get(connection.nodeId);
        if (lease && lease.expires > now && lease.continuousFrom <= (connection.observedAt ?? 0)) live.push(connection);
      }
      if (live.length === seat.connections.length) continue;
      seat.connections = live;
      if (!isConnected(seat)) seat.due = now + GRACE;
      changed = true;
    }
    if (changed) {
      // A lost observation epoch cannot prove who was present at a competitive cutoff.
      if (match?.status === 'PAUSED') {
        for (const seat of room.seats) if (!isConnected(seat)) seat.due = now + GRACE;
      }
      room.revision = advance(room.revision);
      await this.syncLifecycle(tx, room, match, now);
    }
    return changed;
  }

  private async syncLifecycle(tx: Transaction, room: Room, match: Match | null, now: number) {
    if (!match || isTerminal(match)) return;
    const allPresent = room.seats.every(isConnected);
    if (match.status === 'ACTIVE' && !allPresent) {
      match.status = 'PAUSED';
      match.idleDue = null;
      match.version = advance(match.version);
      await this.saveTransition(tx, match, 'PAUSED', now);
    } else if (match.status === 'PAUSED' && allPresent) {
      match.status = 'ACTIVE';
      match.idleDue = now + IDLE_MATCH;
      match.version = advance(match.version);
      await this.saveTransition(tx, match, 'RESUMED', now);
    }
  }

  private async current(tx: Transaction, room: Room) {
    return room.currentMatchId ? required(await tx.read<Match>('matches', room.currentMatchId)) : null;
  }

  private requireHost(seat: Seat) {
    if (!seat.isHost) throw new AppError('NOT_HOST');
  }

  private expected(version: string, expected: string | undefined) {
    if (version !== expected) throw new AppError('STALE_VERSION', version);
  }

  private roomProjection(room: Room, viewer: Seat, last: Match | null, now: number) {
    const lastOwn = last && last.roster.some((s) => s.seatId === viewer.seatId);
    const rematch = lastOwn && last.seriesId === room.seriesId && last.status === 'FINISHED';
    const readiness = rematch
      ? ready(room) && room.consents.length === room.seats.length ? 'REMATCH_READY' : 'REMATCH_WAITING'
      : ready(room) ? 'READY' : 'WAITING';
    const deadline = room.seats.reduce<number | null>((min, seat) => earlier(min, seat.due), null);
    return {
      roomId: room.id, gameId: room.gameId, rulesVersion: room.rulesVersion,
      roomVersion: room.version, presenceRevision: room.revision,
      status: room.status, readiness, viewerSeatId: viewer.seatId,
      hostSeatId: room.seats.find((s) => s.isHost)?.seatId,
      seats: room.seats.map((s) => ({ seatId: s.seatId, nickname: s.nickname, isHost: s.isHost, presence: isConnected(s) ? 'CONNECTED' : 'DISCONNECTED' })),
      currentMatchId: room.currentMatchId, lastMatchId: lastOwn ? last.id : null,
      rematchConsents: [...room.consents], series: room.series,
      inviteExpiresAt: viewer.isHost ? iso(room.inviteExpiry) : null,
      applicableDeadline: iso(deadline), serverTime: iso(now)
    };
  }

  private async viewRoom(tx: Transaction, room: Room, viewer: Seat, now: number) {
    const last = room.lastMatchId ? (await tx.read<Match>('matches', room.lastMatchId)) ?? null : null;
    return this.roomProjection(room, viewer, last, now);
  }

  private viewMatch(room: Room, match: Match, principal: Principal, now: number) {
    const self = required(match.roster.find((s) => s.principalId === principal.principalId));
    if (!isTerminal(match)) required(seatOf(room, principal.principalId));
    const game = required(getGame(match.gameId, match.rulesVersion), 'SERVICE_UNAVAILABLE');
    const state = game.parseState(match.state);
    const view = game.getPlayerView(state, self.seatId);
    const deadline = room.seats.reduce<number | null>((min, seat) => earlier(min, seat.due), null);
    const live = match.status === 'ACTIVE';
    const currentSeries = room.lastMatchId === match.id && room.seriesId === match.seriesId;
    return {
      matchId: match.id, roomId: room.id, gameId: match.gameId, rulesVersion: match.rulesVersion,
      stateSchemaVersion: match.stateSchemaVersion, stateVersion: match.version, status: match.status,
      viewerSeatId: self.seatId, hostSeatId: match.roster.find((s) => s.isHost)?.seatId,
      roster: match.roster.map((s) => ({
        seatId: s.seatId, nickname: s.nickname, isHost: s.isHost, role: match.roles[s.seatId],
        presence: room.seats.some((p) => p.seatId === s.seatId && isConnected(p)) ? 'CONNECTED' : 'DISCONNECTED'
      })),
      ...view,
      turnSeatId: live ? view.turnSeatId : null,
      activeSeatIds: live ? game.getActivePlayers(state) : [],
      legalActions: live ? game.getLegalActions(state, self.seatId) : [],
      result: match.result, roomVersion: room.version, presenceRevision: room.revision,
      rematchConsents: currentSeries ? [...room.consents] : [],
      applicableDeadline: match.status === 'PAUSED' ? iso(deadline) : null, serverTime: iso(now)
    };
  }

  private async roomReceipt<T>(principal: Principal, roomId: string, run: (tx: Transaction, room: Room, match: Match | null, now: number) => Promise<T>) {
    const output = await this.store.transaction('room:' + roomId, async (tx) => {
      await this.authorized(tx, principal);
      const room = required(await tx.read<Room>('rooms', roomId));
      const now = await tx.now();
      const match = await this.current(tx, room);
      const reconciled = await this.reconcileNodes(tx, room, match, now);
      const expired = await this.expire(tx, room, match, now);
      if (expired || reconciled) await this.saveRoom(tx, room, match, now);
      try {
        return { data: await run(tx, room, match, now) };
      } catch (error) {
        // User precondition failures can coexist with a committed system deadline transition.
        if (error instanceof AppError) return { error };
        throw error;
      }
    });
    if (output.error) throw output.error;
    return output.data as T;
  }

  async createRoom(principal: Principal, gameId: string, rulesVersion: number | undefined, commandId: string, origin: string) {
    return this.store.transaction('user:' + principal.principalId, async (tx) => {
      await this.authorized(tx, principal);
      const now = await tx.now();
      const receipt = await this.validReceipt(tx, principal, 'create', commandId, { gameId, rulesVersion }, now);
      if (receipt.existing) {
        const room = required(await tx.read<Room>('rooms', receipt.existing.outcome.roomId));
        const viewer = required(seatOf(room, principal.principalId));
        return { roomId: room.id, roomView: await this.viewRoom(tx, room, viewer, now), aggregateVersion: receipt.existing.version };
      }
      const enabled = required(catalog().find((g) => g.id === gameId && (rulesVersion === undefined || g.rulesVersion === rulesVersion)), 'VALIDATION_ERROR');
      const id = randomUUID();
      if (!await tx.claim('memberships', principal.principalId, id)) throw new AppError('ACTIVE_ROOM_EXISTS');
      const user = required(await tx.read<User>('users', principal.principalId), 'SESSION_EXPIRED');
      const host: Seat = { seatId: randomUUID(), principalId: principal.principalId, nickname: user.nickname, isHost: true, connections: [], due: now + GRACE };
      const room: Room = {
        id, gameId, rulesVersion: enabled.rulesVersion, version: '1', revision: '1', status: 'OPEN',
        seats: [host], inviteKey: null, inviteExpiry: null, currentMatchId: null, lastMatchId: null,
        seriesId: randomUUID(), series: { wins: {}, draws: 0 }, consents: [], idleDue: now + IDLE_ROOM
      };
      const invite = await this.issueInvite(tx, room, now);
      await this.saveRoom(tx, room, null, now);
      await this.saveReceipt(tx, receipt, now, room.version, { roomId: room.id });
      return { roomId: id, inviteUrl: origin + '/join#token=' + invite, roomView: this.roomProjection(room, host, null, now), aggregateVersion: room.version };
    });
  }

  async preview(secret: string) {
    const key = hash(secret);
    return this.store.transaction('invite:' + key, async (tx) => {
      const invite = required(await tx.read<Invitation>('invites', key), 'INVITATION_UNAVAILABLE');
      const room = required(await tx.read<Room>('rooms', invite.roomId), 'INVITATION_UNAVAILABLE');
      if (!invite.active || invite.expiry <= await tx.now() || room.status !== 'OPEN' || room.seats.length >= 2) {
        throw new AppError('INVITATION_UNAVAILABLE');
      }
      return { gameId: room.gameId, title: descriptions[room.gameId].title, rulesVersion: room.rulesVersion };
    });
  }

  async join(principal: Principal, secret: string, commandId: string) {
    const key = hash(secret);
    const invite = await this.store.transaction('invite:' + key, async (tx) => required(await tx.read<Invitation>('invites', key), 'INVITATION_UNAVAILABLE'));
    return this.roomReceipt(principal, invite.roomId, async (tx, room, _match, now) => {
      const existing = seatOf(room, principal.principalId);
      if (existing) {
        const receipt = await this.validReceipt(tx, principal, 'join/' + key, commandId, { key }, now);
        return { roomId: room.id, roomView: await this.viewRoom(tx, room, existing, now), aggregateVersion: receipt.existing?.version ?? room.version };
      }
      if (room.status !== 'OPEN' || room.seats.length >= 2 || room.inviteKey !== key || (room.inviteExpiry ?? 0) <= now) {
        throw new AppError('INVITATION_UNAVAILABLE');
      }
      const receipt = await this.validReceipt(tx, principal, 'join/' + key, commandId, { key }, now);
      if (!await tx.claim('memberships', principal.principalId, room.id)) throw new AppError('ACTIVE_ROOM_EXISTS');
      const guest: Seat = { seatId: randomUUID(), principalId: principal.principalId, nickname: principal.nickname, isHost: false, connections: [], due: now + GRACE };
      room.seats.push(guest);
      room.version = advance(room.version);
      room.revision = advance(room.revision);
      room.idleDue = now + IDLE_ROOM;
      await this.invalidateInvite(tx, room);
      await this.saveRoom(tx, room, null, now);
      await this.saveReceipt(tx, receipt, now, room.version, { roomId: room.id });
      return { roomId: room.id, roomView: await this.viewRoom(tx, room, guest, now), aggregateVersion: room.version };
    }).catch((error: unknown) => {
      if (error instanceof AppError && error.code === 'NOT_FOUND_OR_FORBIDDEN') throw new AppError('INVITATION_UNAVAILABLE');
      throw error;
    });
  }

  private async readMatchRoom(matchId: string) {
    return this.store.transaction('matchlookup:' + matchId, async (tx) => required(await tx.read<Match>('matches', matchId)).roomId);
  }

  async room(principal: Principal, id: string) {
    return this.roomReceipt(principal, id, (tx, room, _match, now) => this.viewRoom(tx, room, required(seatOf(room, principal.principalId)), now));
  }

  async match(principal: Principal, id: string) {
    return this.roomReceipt(principal, await this.readMatchRoom(id), async (tx, room, _match, now) => this.viewMatch(room, required(await tx.read<Match>('matches', id)), principal, now));
  }

  async history(principal: Principal, roomId: string) {
    return this.roomReceipt(principal, roomId, async (tx, room) => {
      required(seatOf(room, principal.principalId));
      const ids = (await tx.read<string[]>('room_history', roomId)) ?? [];
      const summaries = [];
      for (const id of ids.slice(-25).reverse()) {
        const match = await tx.read<Match>('matches', id);
        if (match?.result && match.roster.some((s) => s.principalId === principal.principalId)) {
          summaries.push({ matchId: match.id, finishedAt: iso(match.finishedAt), result: match.result });
        }
      }
      return { matches: summaries };
    });
  }

  async rotate(principal: Principal, roomId: string, command: Command, origin: string) {
    return this.roomReceipt(principal, roomId, async (tx, room, _match, now) => {
      const viewer = required(seatOf(room, principal.principalId));
      this.requireHost(viewer);
      const receipt = await this.validReceipt(tx, principal, 'rotate/' + room.id, command.commandId, command, now);
      if (receipt.existing) return { roomId, roomView: await this.viewRoom(tx, room, viewer, now), aggregateVersion: receipt.existing.version };
      this.expected(room.version, command.expectedRoomVersion);
      if (room.status !== 'OPEN' || room.seats.length >= 2) throw new AppError('ROOM_FULL');
      const secret = await this.issueInvite(tx, room, now);
      room.version = advance(room.version);
      room.idleDue = now + IDLE_ROOM;
      await this.saveRoom(tx, room, null, now);
      await this.saveReceipt(tx, receipt, now, room.version, { roomId });
      return { roomId, roomView: await this.viewRoom(tx, room, viewer, now), inviteUrl: origin + '/join#token=' + secret, aggregateVersion: room.version };
    });
  }

  async leave(principal: Principal, roomId: string, command: Command) {
    return this.roomReceipt(principal, roomId, async (tx, room, _match, now) => {
      const viewer = required(seatOf(room, principal.principalId));
      const receipt = await this.validReceipt(tx, principal, 'leave/' + room.id, command.commandId, command, now);
      this.expected(room.version, command.expectedRoomVersion);
      if (room.status === 'PLAYING') throw new AppError('MATCH_ALREADY_STARTED');
      await this.release(tx, room, viewer, now);
      await this.saveRoom(tx, room, null, now);
      await this.saveReceipt(tx, receipt, now, room.version, { roomId });
      return { roomId, aggregateVersion: room.version };
    });
  }

  async start(principal: Principal, roomId: string, command: Command) {
    return this.roomReceipt(principal, roomId, async (tx, room, _match, now) => {
      this.requireHost(required(seatOf(room, principal.principalId)));
      const receipt = await this.validReceipt(tx, principal, 'start/' + room.id, command.commandId, command, now);
      if (receipt.existing) {
        const match = required(await tx.read<Match>('matches', required(receipt.existing.outcome.matchId)));
        return { matchId: match.id, playerView: this.viewMatch(room, match, principal, now), aggregateVersion: receipt.existing.version };
      }
      this.expected(room.version, command.expectedRoomVersion);
      if (room.status === 'PLAYING') throw new AppError('MATCH_ALREADY_STARTED');
      if (!ready(room)) throw new AppError('ROOM_NOT_READY');
      const previous = room.lastMatchId ? await tx.read<Match>('matches', room.lastMatchId) : undefined;
      const rematch = previous?.status === 'FINISHED' && previous.seriesId === room.seriesId;
      if (rematch && room.consents.length !== room.seats.length) throw new AppError('REMATCH_NOT_READY');
      const game = required(getGame(room.gameId, room.rulesVersion), 'SERVICE_UNAVAILABLE');
      const opening = rematch
        ? room.seats.findIndex((s) => previous?.roles[s.seatId] === game.roles[1])
        : randomInt(2);
      if (opening < 0) throw new AppError('SERVICE_UNAVAILABLE');
      const roles = Object.fromEntries(room.seats.map((s, i) => [s.seatId, game.roles[i === opening ? 0 : 1]]));
      const state = game.initialize({ seats: room.seats.map((s) => ({ seatId: s.seatId, role: roles[s.seatId] })), options: {}, serverTimeMs: now });
      const match: Match = {
        id: randomUUID(), roomId, state, status: 'ACTIVE', version: '1', gameId: room.gameId,
        rulesVersion: room.rulesVersion, stateSchemaVersion: game.stateSchemaVersion,
        roster: room.seats.map(({ seatId, principalId, nickname, isHost }) => ({ seatId, principalId, nickname, isHost })),
        roles, seriesId: room.seriesId, result: null, idleDue: now + IDLE_MATCH, finishedAt: null
      };
      for (const seat of room.seats) {
        const user = required(await tx.read<User>('users', seat.principalId), 'SERVICE_UNAVAILABLE');
        await tx.put('users', seat.principalId, { nickname: user.nickname, played: true });
      }
      const history = (await tx.read<string[]>('room_history', roomId)) ?? [];
      await tx.put('room_history', roomId, [...history.slice(-249), match.id]);
      room.version = advance(room.version);
      room.status = 'PLAYING';
      room.currentMatchId = match.id;
      room.consents = [];
      await this.saveTransition(tx, match, 'STARTED', now, { roles });
      await this.saveRoom(tx, room, match, now);
      await this.saveReceipt(tx, receipt, now, match.version, { roomId, matchId: match.id });
      return { matchId: match.id, playerView: this.viewMatch(room, match, principal, now), aggregateVersion: match.version };
    });
  }

  async consent(principal: Principal, matchId: string, command: Command & { consent: boolean }) {
    const roomId = await this.readMatchRoom(matchId);
    return this.roomReceipt(principal, roomId, async (tx, room, _current, now) => {
      const seat = required(seatOf(room, principal.principalId));
      const receipt = await this.validReceipt(tx, principal, 'consent/' + matchId, command.commandId, command, now);
      if (receipt.existing) return { roomId, roomView: await this.viewRoom(tx, room, seat, now), aggregateVersion: receipt.existing.version };
      this.expected(room.version, command.expectedRoomVersion);
      const match = required(await tx.read<Match>('matches', matchId));
      if (room.status !== 'OPEN' || room.lastMatchId !== matchId || match.status !== 'FINISHED' || room.seriesId !== match.seriesId) {
        throw new AppError('REMATCH_NOT_READY');
      }
      const consents = command.consent ? [...new Set([...room.consents, seat.seatId])] : [];
      if (consents.length !== room.consents.length) {
        room.consents = consents;
        room.version = advance(room.version);
        room.idleDue = now + IDLE_ROOM;
        await this.saveRoom(tx, room, null, now);
      }
      await this.saveReceipt(tx, receipt, now, room.version, { roomId, matchId });
      return { roomId, roomView: await this.viewRoom(tx, room, seat, now), aggregateVersion: room.version };
    });
  }

  async action(principal: Principal, matchId: string, command: Command & { action?: unknown }, operation: 'action' | 'resign') {
    const roomId = await this.readMatchRoom(matchId);
    return this.roomReceipt(principal, roomId, async (tx, room, _current, now) => {
      const seat = required(seatOf(room, principal.principalId));
      const match = required(await tx.read<Match>('matches', matchId));
      required(match.roster.find((s) => s.seatId === seat.seatId));
      const game = required(getGame(match.gameId, match.rulesVersion), 'SERVICE_UNAVAILABLE');
      let action;
      if (operation === 'action') {
        try { action = game.parseAction(command.action); }
        catch { throw new AppError('VALIDATION_ERROR'); }
      }
      const receipt = await this.validReceipt(tx, principal, 'match/' + matchId, command.commandId, { ...command, operation, action }, now);
      if (receipt.existing) return { matchId, playerView: this.viewMatch(room, match, principal, now), aggregateVersion: receipt.existing.version };
      if (isTerminal(match)) throw new AppError('MATCH_ENDED');
      if (match.status === 'PAUSED' && operation === 'action') throw new AppError('MATCH_PAUSED', match.version);
      this.expected(match.version, command.expectedVersion);
      const next = advance(match.version);
      if (operation === 'resign') {
        const opponent = required(match.roster.find((s) => s.seatId !== seat.seatId));
        await this.finish(tx, room, match, this.outcome('WIN', 'RESIGNATION', [opponent.seatId], next), now, 'RESIGNATION', { seatId: seat.seatId });
      } else if (action) {
        const current = game.parseState(match.state);
        const decision = game.validateAction(current, seat.seatId, action);
        if (!decision.ok) throw new AppError(decision.code);
        match.state = game.applyAction(current, seat.seatId, action, {
          seats: match.roster.map((s) => ({ seatId: s.seatId, role: match.roles[s.seatId] })),
          options: {}, serverTimeMs: now
        }).state;
        const natural = game.getResult(match.state);
        const detail = { seatId: seat.seatId, action };
        if (natural) {
          await this.finish(tx, room, match, this.outcome(natural.kind, natural.reason, natural.winnerSeatIds, next, natural.winningLines ?? []), now, 'MOVE', detail);
        } else {
          match.idleDue = now + IDLE_MATCH;
          match.version = next;
          await this.saveTransition(tx, match, 'MOVE', now, detail);
        }
      }
      await this.saveRoom(tx, room, match, now);
      await this.saveReceipt(tx, receipt, now, match.version, { roomId, matchId });
      return { matchId, playerView: this.viewMatch(room, match, principal, now), aggregateVersion: match.version };
    });
  }

  async subscribeRoom(principal: Principal, roomId: string, link: Connection) {
    return this.roomReceipt(principal, roomId, async (tx, room, match, now) => {
      const seat = required(seatOf(room, principal.principalId));
      await this.connectSeat(tx, room, match, seat, link, now);
      return this.viewRoom(tx, room, seat, now);
    });
  }

  async subscribeMatch(principal: Principal, matchId: string, link: Connection) {
    const roomId = await this.readMatchRoom(matchId);
    return this.roomReceipt(principal, roomId, async (tx, room, current, now) => {
      const match = required(await tx.read<Match>('matches', matchId));
      required(match.roster.find((seat) => seat.principalId === principal.principalId));
      const seat = seatOf(room, principal.principalId);
      if (seat && match.roster.some((player) => player.seatId === seat.seatId)) {
        await this.connectSeat(tx, room, current, seat, link, now);
      }
      return this.viewMatch(room, current?.id === matchId ? current : match, principal, now);
    });
  }

  private async connectSeat(tx: Transaction, room: Room, match: Match | null, seat: Seat, link: Connection, now: number) {
    if (seat.connections.some((c) => c.connectionId === link.connectionId && c.nodeId === link.nodeId)) return;
    if (seat.connections.length >= 8) throw new AppError('RATE_LIMITED', undefined, 3_000);
    const already = isConnected(seat);
    seat.connections.push({ ...link, observedAt: now });
    seat.due = null;
    if (!already) {
      room.revision = advance(room.revision);
      await this.syncLifecycle(tx, room, match, now);
    }
    await this.saveRoom(tx, room, match, now);
  }

  async disconnect(roomId: string, link: Connection) {
    await this.store.transaction('room:' + roomId, async (tx) => {
      const room = await tx.read<Room>('rooms', roomId);
      if (!room) return;
      const seat = room.seats.find((s) => s.connections.some((c) => c.connectionId === link.connectionId && c.nodeId === link.nodeId));
      if (!seat) return;
      const now = await tx.now();
      const match = await this.current(tx, room);
      await this.reconcileNodes(tx, room, match, now);
      const changed = await this.expire(tx, room, match, now);
      if (changed && !room.seats.includes(seat)) {
        await this.saveRoom(tx, room, match, now);
        return;
      }
      seat.connections = seat.connections.filter((c) => c.connectionId !== link.connectionId || c.nodeId !== link.nodeId);
      if (!isConnected(seat)) {
        room.revision = advance(room.revision);
        seat.due = now + GRACE;
        await this.syncLifecycle(tx, room, match, now);
      }
      await this.saveRoom(tx, room, match, now);
    });
  }

  async heartbeat(nodeId: string) {
    if (nodeId === 'fixture') return false;
    return this.store.transaction('node:' + nodeId, async (tx) => {
      const now = await tx.now();
      const previous = await tx.read<NodeLease | number>('nodes', nodeId);
      const previousExpires = typeof previous === 'number' ? previous : previous?.expires;
      const gap = previousExpires !== undefined && previousExpires <= now;
      const expires = now + NODE_TTL;
      const continuousFrom = !previous || gap ? now : typeof previous === 'number' ? 0 : previous.continuousFrom;
      await tx.put('nodes', nodeId, { expires, continuousFrom }, expires + HISTORY_TTL);
      return gap;
    });
  }

  async tick() {
    const ids = await this.store.due('rooms', 64);
    for (const id of ids) {
      await this.store.transaction('room:' + id, async (tx) => {
        const room = await tx.read<Room>('rooms', id);
        if (!room) return;
        const now = await tx.now();
        if (room.status === 'CLOSED' || room.status === 'EXPIRED') {
          if (room.closedAt === undefined || room.closedAt + HISTORY_TTL > now) return;
          await tx.remove('rooms', id);
          await tx.remove('room_history', id);
          return;
        }
        const match = await this.current(tx, room);
        const changed = await this.reconcileNodes(tx, room, match, now);
        const expired = await this.expire(tx, room, match, now);
        if (changed || expired) await this.saveRoom(tx, room, match, now);
        else {
          const due = room.seats.reduce<number | null>((min, seat) => earlier(min, seat.due), room.status === 'OPEN' ? room.idleDue : match?.idleDue ?? null);
          const next = room.seats.some(isConnected) ? earlier(due, now + PRESENCE_TICK) : due;
          await tx.put('rooms', id, room, next ?? undefined);
        }
      });
    }
  }

  async prune() {
    for (const collection of ['bootstraps', 'sessions', 'invites', 'matches', 'match_actions', 'nodes', 'receipts']) {
      for (const id of await this.store.due(collection, 100)) {
        await this.store.transaction('retention:' + collection + '/' + id, async (tx) => {
          await tx.remove(collection, id);
          if (collection === 'matches') await tx.removePrefix('match_actions', id + '/');
        });
      }
    }
    await this.store.pruneEvents();
  }
}
