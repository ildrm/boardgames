import type { Cell, GameMove, GameSeat, SeatId } from '@tablemate/contracts';

export type GameContext = Readonly<{
  seats: readonly GameSeat[];
  options: Readonly<Record<string, unknown>>;
  serverTimeMs: number;
  random?: { nextInt(minInclusive: number, maxExclusive: number): number };
}>;

export type GameResult = Readonly<{
  kind: 'WIN' | 'DRAW';
  winnerSeatIds: readonly SeatId[];
  reason: string;
  winningLines?: readonly (readonly Cell[])[];
  placements?: readonly { seatId: SeatId; rank: number }[];
}>;

export type Resolution = { ok: true } | { ok: false; code: string };

export class GameError extends Error {
  readonly code: string;
  constructor(code: string) {
    super(code);
    this.name = 'GameError';
    this.code = code;
  }
}

export interface GameDefinition<State, Action, PlayerView> {
  readonly id: string;
  readonly rulesVersion: number;
  readonly stateSchemaVersion: number;
  readonly supportedPlayerCounts: readonly number[];
  readonly capabilities: Readonly<{
    hiddenInformation: boolean;
    randomness: boolean;
    simultaneousActions: boolean;
    teams: boolean;
  }>;
  parseOptions(raw: unknown): Readonly<Record<string, unknown>>;
  parseAction(raw: unknown): Action;
  parseState(raw: unknown): State;
  initialize(context: GameContext): State;
  getActivePlayers(state: Readonly<State>): readonly SeatId[];
  getLegalActions(state: Readonly<State>, seatId: SeatId): readonly Action[];
  validateAction(state: Readonly<State>, seatId: SeatId, action: Action): Resolution;
  applyAction(
    state: Readonly<State>, seatId: SeatId, action: Action, context: GameContext,
  ): { state: State; domainEvents: readonly unknown[] };
  getResult(state: Readonly<State>): GameResult | null;
  getPlayerView(state: Readonly<State>, viewerSeatId: SeatId): PlayerView;
}

export function replay<State, Action, View>(
  definition: GameDefinition<State, Action, View>,
  context: GameContext,
  history: readonly GameMove<unknown>[],
): State {
  let state = definition.initialize(context);
  for (const { seatId, action } of history) {
    const parsed = definition.parseAction(action);
    state = definition.applyAction(state, seatId, parsed, context).state;
  }
  return state;
}

export { defineAlternatingBoard, type RegisteredGame } from './alternating-board.ts';
