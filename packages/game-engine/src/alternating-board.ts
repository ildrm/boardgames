import { z } from 'zod';
import {
  type Cell,
  type GameAction,
  type GameId,
  type GameState,
  type GameView,
  type SeatId,
  cellSchema,
  seatIdSchema,
} from '@tablemate/contracts';
import { type GameContext, type GameDefinition, GameError, type Resolution } from './index.ts';

type Board = GameState['board'];

export type RegisteredGame = GameDefinition<GameState, GameAction, GameView> & Readonly<{
  id: GameId;
  roles: readonly [string, string];
  metadata: { title: string; description: string };
  applyAction(state: GameState, seatId: SeatId, action: GameAction, context?: GameContext): {
    state: GameState;
    domainEvents: readonly unknown[];
  };
}>;

type BoardRules<Action extends GameAction> = Readonly<{
  id: GameId;
  metadata: RegisteredGame['metadata'];
  rows: number;
  cols: number;
  roles: readonly [string, string];
  actionSchema: z.ZodType<Action>;
  unavailableCode: string;
  target(board: Board, action: Action): Cell | null;
  legalActions(board: Board): readonly Action[];
  winningLines(board: Board, placed: Cell, role: string): readonly (readonly Cell[])[];
}>;

const noOptions = z.strictObject({});
const lastMoveSchema = cellSchema.extend({ seatId: seatIdSchema });

export function defineAlternatingBoard<Action extends GameAction>(
  rules: BoardRules<Action>,
): RegisteredGame {
  const capacity = rules.rows * rules.cols;
  const roles = z.enum(rules.roles);
  const rosterSchema = z.array(z.strictObject({ seatId: seatIdSchema, role: roles })).length(2).refine(
    (seats) => new Set(seats.map((seat) => seat.seatId)).size === 2
      && new Set(seats.map((seat) => seat.role)).size === 2,
  );
  const stateSchema = z.strictObject({
    board: z.array(z.array(roles.nullable()).length(rules.cols)).length(rules.rows),
    turnSeatId: seatIdSchema.nullable(),
    moveCount: z.number().int().min(0).max(capacity),
    lastMove: lastMoveSchema.nullable(),
    winningLines: z.array(z.array(cellSchema).min(3).max(7)).max(4),
    seats: rosterSchema,
    history: z.array(z.strictObject({ seatId: seatIdSchema, action: rules.actionSchema })).max(capacity),
  });

  function initialize(context: GameContext): GameState {
    noOptions.parse(context.options);
    const seats = rosterSchema.parse(context.seats);
    const first = seats.find((seat) => seat.role === rules.roles[0]);
    if (!first) throw new GameError('INVALID_ROSTER');
    return {
      board: Array.from({ length: rules.rows }, () => Array<null>(rules.cols).fill(null)),
      turnSeatId: first.seatId,
      moveCount: 0,
      lastMove: null,
      winningLines: [],
      seats,
      history: [],
    };
  }

  function resolve(state: GameState, seatId: SeatId, action: GameAction):
    { ok: true; cell: Cell; action: Action } | { ok: false; code: string } {
    const parsed = rules.actionSchema.safeParse(action);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_ERROR' };
    if (state.turnSeatId === null) return { ok: false, code: 'MATCH_ENDED' };
    if (state.turnSeatId !== seatId) return { ok: false, code: 'NOT_YOUR_TURN' };
    const cell = rules.target(state.board, parsed.data);
    if (!cell) return { ok: false, code: rules.unavailableCode };
    return { ok: true, cell, action: parsed.data };
  }

  function validateAction(state: GameState, seatId: SeatId, action: GameAction): Resolution {
    const resolved = resolve(state, seatId, action);
    return resolved.ok ? { ok: true } : resolved;
  }

  function applyAction(state: GameState, seatId: SeatId, action: GameAction) {
    const resolved = resolve(state, seatId, action);
    if (!resolved.ok) throw new GameError(resolved.code);
    const player = state.seats.find((seat) => seat.seatId === seatId);
    const nextPlayer = state.seats.find((seat) => seat.seatId !== seatId);
    if (!player || !nextPlayer) throw new GameError('INVALID_ROSTER');
    const { row, col } = resolved.cell;
    const board = state.board.map((line, i) => i === row
      ? line.map((value, j) => j === col ? player.role : value)
      : line);
    const winningLines = rules.winningLines(board, resolved.cell, player.role);
    const moveCount = state.moveCount + 1;
    const lastMove = { row, col, seatId };
    const turnSeatId = winningLines.length || moveCount === capacity ? null : nextPlayer.seatId;
    const newState: GameState = {
      ...state,
      board,
      moveCount,
      lastMove,
      winningLines,
      turnSeatId,
      history: [...state.history, { seatId, action: resolved.action }],
    };
    return { state: newState, domainEvents: [{ type: 'MOVE_PLACED', ...lastMove }] };
  }

  function parseState(raw: unknown): GameState {
    const parsed = stateSchema.parse(raw);
    let trusted = initialize({ seats: parsed.seats, options: {}, serverTimeMs: 0 });
    for (const { seatId, action } of parsed.history) {
      trusted = applyAction(trusted, seatId, action).state;
    }
    // Both projections use the same field order by construction. Zod has
    // already normalized cell keys and rejected unknown fields before replay.
    const { board, moveCount, lastMove, winningLines, turnSeatId } = parsed;
    if (JSON.stringify({ board, moveCount, lastMove, winningLines, turnSeatId }) !== JSON.stringify({
      board: trusted.board,
      moveCount: trusted.moveCount,
      lastMove: trusted.lastMove,
      winningLines: trusted.winningLines,
      turnSeatId: trusted.turnSeatId,
    })) {
      throw new GameError('INVALID_SNAPSHOT');
    }
    return trusted;
  }

  return {
    id: rules.id,
    metadata: rules.metadata,
    roles: rules.roles,
    supportedPlayerCounts: [2],
    rulesVersion: 1,
    stateSchemaVersion: 1,
    capabilities: { hiddenInformation: false, randomness: false, simultaneousActions: false, teams: false },
    parseOptions: (raw) => noOptions.parse(raw),
    parseAction: (raw) => rules.actionSchema.parse(raw),
    parseState,
    initialize,
    getActivePlayers: (state) => state.turnSeatId ? [state.turnSeatId] : [],
    getLegalActions: (state, seatId) => state.turnSeatId === seatId ? rules.legalActions(state.board) : [],
    validateAction,
    applyAction,
    getResult(state) {
      if (state.winningLines.length && state.lastMove) {
        return {
          kind: 'WIN', reason: 'LINE_COMPLETED', winnerSeatIds: [state.lastMove.seatId],
          winningLines: state.winningLines,
        };
      }
      return state.moveCount === capacity
        ? { kind: 'DRAW', reason: 'BOARD_FULL', winnerSeatIds: [], winningLines: [] }
        : null;
    },
    getPlayerView(state, viewerSeatId) {
      if (!state.seats.some((seat) => seat.seatId === viewerSeatId)) throw new GameError('NOT_FOUND_OR_FORBIDDEN');
      return {
        board: state.board,
        moveCount: state.moveCount,
        turnSeatId: state.turnSeatId,
        lastMove: state.lastMove,
        winningLines: state.winningLines,
      };
    },
  };
}
