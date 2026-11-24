import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';

type Seat = { seatId: string; role?: string; presence: string };
export type Lobby = {
  roomId: string;
  roomVersion: string;
  readiness: string;
  viewerSeatId: string;
  seats: Seat[];
  currentMatchId: string | null;
};
export type Match = {
  matchId: string;
  stateVersion: string;
  viewerSeatId: string;
  turnSeatId: string | null;
  status: string;
  moveCount: number;
  board: (string | null)[][];
  roster: Seat[];
  result: { kind: string; reason: string; winnerSeatIds: string[]; winningLines: unknown[] } | null;
};

type Success<T> = { ok: true; data: T; aggregateVersion?: string };
type Failure = { ok: false; code: string };
type Exchange<T> = Success<T> | Failure;

export function success<T>(reply: Exchange<T>): Success<T> {
  assert.ok(reply.ok, reply.ok ? undefined : reply.code);
  return reply;
}

export const origin = process.env.TABLEMATE_TEST_ORIGIN ?? 'http://localhost:8080';
export const primary = process.env.TABLEMATE_TEST_API ?? 'http://localhost:3000';
export const secondary = process.env.TABLEMATE_TEST_API_2 ?? 'http://localhost:3001';

export class Client {
  private readonly cookies = new Map<string, string>();
  constructor(private readonly base: string) {}

  async http<T>(path: string, payload?: unknown, method = payload === undefined ? 'GET' : 'POST', base = this.base) {
    const response = await fetch(base + '/api/v1' + path, {
      method, headers: {
        Origin: origin,
        Cookie: this.cookieHeader(),
        ...(payload === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
      signal: AbortSignal.timeout(7000),
    });
    for (const value of response.headers.getSetCookie()) {
      const pair = value.split(';', 1)[0];
      const equals = pair.indexOf('=');
      this.cookies.set(pair.slice(0, equals), pair.slice(equals + 1));
    }
    return await response.json() as Exchange<T>;
  }

  async guest(nickname: string) {
    success(await this.http('/sessions/bootstrap', {}));
    return success(await this.http('/sessions/guest', { nickname, commandId: randomUUID() }));
  }

  async socket(url = this.base) {
    const socket = io(url, {
      transports: ['websocket'],
      extraHeaders: { Origin: origin, Cookie: this.cookieHeader() },
      reconnection: false, forceNew: true, autoConnect: false, timeout: 5000,
    });
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', resolve).once('connect_error', reject).connect();
    }).catch((error: unknown) => {
      socket.disconnect();
      throw error;
    });
    return socket;
  }

  private cookieHeader() {
    return [...this.cookies].map(([key, value]) => key + '=' + value).join('; ');
  }
}

export const emit = async <T>(socket: Socket, event: string, payload: unknown) =>
  await socket.timeout(7000).emitWithAck(event, payload) as Exchange<T>;

export function waitForView<T>(socket: Socket, event: string, project: (data: unknown) => T, accept: (data: T) => boolean) {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off(event, onEvent);
      reject(new Error('Timed out waiting for ' + event));
    }, 8000);
    timer.unref();
    function onEvent(payload: unknown) {
      const view = project(payload);
      if (!view || !accept(view)) return;
      clearTimeout(timer);
      socket.off(event, onEvent);
      resolve(view);
    }
    socket.on(event, onEvent);
  });
}

export async function setupRoom(gameId: string, host: Client, guest: Client) {
  await Promise.all([host.guest('Host'), guest.guest('Guest')]);
  const creationId = randomUUID();
  const params = { gameId, commandId: creationId };
  const created = success(await host.http<{ roomId: string; inviteUrl: string }>('/rooms', params)).data;
  const replay = success(await host.http<typeof created>('/rooms', params)).data;
  assert.equal(replay.roomId, created.roomId);
  assert.equal(replay.inviteUrl, undefined);
  const token = new URLSearchParams(new URL(created.inviteUrl).hash.slice(1)).get('token');
  assert.ok(token);
  return { roomId: created.roomId, token };
}
