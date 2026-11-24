export type Presence = 'CONNECTED' | 'DISCONNECTED' | 'UNKNOWN';
export type Cell = { row: number; col: number };
export type Action =
  | { type: 'PLACE_MARK'; payload: Cell }
  | { type: 'DROP_DISC'; payload: { col: number } };

export type Seat = {
  seatId: string;
  nickname: string;
  role?: string;
  isHost: boolean;
  presence: Presence;
};

export type Game = {
  id: string;
  title: string;
  description: string;
  rulesVersion: number;
  stateSchemaVersion: number;
  playerCount: number;
};

export type RoomView = {
  roomId: string;
  gameId: string;
  rulesVersion: number;
  roomVersion: string;
  presenceRevision: string;
  status: 'OPEN' | 'PLAYING' | 'CLOSED' | 'EXPIRED';
  readiness: 'WAITING' | 'READY' | 'REMATCH_WAITING' | 'REMATCH_READY';
  viewerSeatId: string;
  hostSeatId: string;
  seats: Seat[];
  currentMatchId: string | null;
  lastMatchId: string | null;
  rematchConsents: string[];
  series: { wins: Record<string, number>; draws: number };
  inviteExpiresAt?: string | null;
  applicableDeadline?: string | null;
  serverTime?: string;
};

export type MatchView = {
  matchId: string;
  roomId: string;
  gameId: string;
  rulesVersion: number;
  stateSchemaVersion: number;
  stateVersion: string;
  status: 'ACTIVE' | 'PAUSED' | 'FINISHED' | 'ABANDONED';
  viewerSeatId: string;
  hostSeatId: string;
  roster: Seat[];
  board: (string | null)[][];
  moveCount: number;
  turnSeatId: string | null;
  lastMove: (Cell & { seatId: string }) | null;
  winningLines: Cell[][];
  activeSeatIds: string[];
  legalActions: Action[];
  result: {
    kind: 'WIN' | 'DRAW' | 'ABANDONED';
    winnerSeatIds: string[];
    reason: string;
    winningLines: Cell[][];
  } | null;
  applicableDeadline?: string | null;
  roomVersion: string;
  presenceRevision: string;
  rematchConsents: string[];
  serverTime?: string;
};

type ResponseBody<T> =
  | { ok: true; data: T }
  | { ok: false; code: string; retryable?: boolean; retryAfterMs?: number };

export class ApiError extends Error {
  constructor(public code: string, public retryable = false, public retryAfterMs?: number) {
    super(code);
  }
}

export async function request<T>(path: string, options: { method?: string; body?: unknown; signal?: AbortSignal } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch('/api/v1' + path, {
      method: options.method ?? 'GET',
      credentials: 'same-origin',
      cache: 'no-store',
      signal: options.signal ?? AbortSignal.timeout(8_000),
      ...(options.body === undefined ? {} : {
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(options.body),
      }),
    });
  } catch {
    throw new ApiError(navigator.onLine ? 'SERVICE_UNAVAILABLE' : 'OFFLINE', true);
  }
  const body = await response.json().catch(() => null) as ResponseBody<T> | null;
  if (response.ok && body?.ok) return body.data;
  throw new ApiError(
    body && !body.ok ? body.code : 'SERVICE_UNAVAILABLE',
    body && !body.ok ? body.retryable : response.status >= 500,
    body && !body.ok ? body.retryAfterMs : undefined,
  );
}

export type Identity = { principalId: string; nickname: string; activeRoomId: string | null };
export type RoomMutation = { roomId: string; roomView?: RoomView; inviteUrl?: string };
export type MatchMutation = { matchId: string; playerView?: MatchView };

let bootstrapCommand: string | null = null;
export async function ensureGuest(nickname: string) {
  try {
    return await request<Identity>('/me');
  } catch (error) {
    if (!(error instanceof ApiError) || !['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(error.code)) throw error;
  }
  if (!bootstrapCommand) {
    await request('/sessions/bootstrap', { method: 'POST', body: {} });
    bootstrapCommand = crypto.randomUUID();
  }
  try {
    const identity = await request<Identity>('/sessions/guest', {
      method: 'POST',
      body: { ...(nickname.trim() ? { nickname } : {}), commandId: bootstrapCommand },
    });
    bootstrapCommand = null;
    return identity;
  } catch (error) {
    if (error instanceof ApiError && !error.retryable) bootstrapCommand = null;
    throw error;
  }
}
