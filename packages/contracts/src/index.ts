import { z } from 'zod';

export const gameIdSchema = z.enum(['tic-tac-toe', 'four-in-a-row']);
export type GameId = z.infer<typeof gameIdSchema>;

export type SeatId = string;
export const seatIdSchema = z.string().min(1).max(128);
export const identifierSchema = z.uuid();
export const commandIdSchema = identifierSchema;
export const versionSchema = z.string().max(19).regex(/^(0|[1-9][0-9]*)$/).refine(
  (value) => value.length < 19 || value <= '9223372036854775807',
);
export const ruleVersionSchema = z.number().int().min(1).max(2147483647);

export function compareVersions(left: string, right: string): -1 | 0 | 1 {
  versionSchema.parse(left);
  versionSchema.parse(right);
  if (left.length !== right.length) return left.length < right.length ? -1 : 1;
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
const utf8 = new TextEncoder();
export const nicknameSchema = z.string().max(1024).transform((value) => value.trim().normalize('NFC')).refine(
  (value) => {
    // Persian ZWNJ and legitimate ZWJ sequences survive normalization.
    const allowedText = value.replace(/[\u200c\u200d]/gu, '');
    if (!/[\p{L}\p{N}\p{P}\p{S}]/u.test(allowedText) || /[\p{Cc}\p{Cf}\p{Cs}\u2028\u2029]/u.test(allowedText)) {
      return false;
    }
    const length = Array.from(graphemes.segment(value)).filter(({ segment }) =>
      /[\p{L}\p{N}\p{P}\p{S}]/u.test(segment),
    ).length;
    return length <= 24 && utf8.encode(value).length <= 256;
  },
  'Use 1–24 visible characters and up to 256 UTF-8 bytes.',
);

const coordinate = (maximum: number) => z.number().int().min(0).max(maximum);
export const cellSchema = z.strictObject({ row: coordinate(5), col: coordinate(6) });
export type Cell = Readonly<z.infer<typeof cellSchema>>;

export const placeMarkSchema = z.strictObject({
  type: z.literal('PLACE_MARK'),
  payload: z.strictObject({ row: coordinate(2), col: coordinate(2) }),
});
export const dropDiscSchema = z.strictObject({
  type: z.literal('DROP_DISC'),
  payload: z.strictObject({ col: coordinate(6) }),
});
export const gameActionSchema = z.discriminatedUnion('type', [placeMarkSchema, dropDiscSchema]);
export type GameAction = z.infer<typeof gameActionSchema>;
export type PlaceMark = z.infer<typeof placeMarkSchema>;
export type DropDisc = z.infer<typeof dropDiscSchema>;

export type GameSeat = Readonly<{ seatId: SeatId; role: string }>;
export type GameMove<A = GameAction> = Readonly<{ seatId: SeatId; action: A }>;
export type GameView = Readonly<{
  board: readonly (readonly (string | null)[])[];
  moveCount: number;
  turnSeatId: SeatId | null;
  lastMove: (Cell & Readonly<{ seatId: SeatId }>) | null;
  winningLines: readonly (readonly Cell[])[];
}>;
export type GameState<A = GameAction> = GameView & Readonly<{
  seats: readonly GameSeat[];
  history: readonly GameMove<A>[];
}>;

export const actionCommandSchema = z.strictObject({
  matchId: identifierSchema,
  commandId: commandIdSchema,
  expectedVersion: versionSchema,
  action: gameActionSchema,
});
export const roomSubscribeSchema = z.strictObject({
  roomId: identifierSchema,
  lastKnownRoomVersion: versionSchema.optional(),
});
export const matchSubscribeSchema = z.strictObject({
  matchId: identifierSchema,
  lastKnownStateVersion: versionSchema.optional(),
});
export const startCommandSchema = z.strictObject({
  roomId: identifierSchema,
  commandId: commandIdSchema,
  expectedRoomVersion: versionSchema,
});
export const resignCommandSchema = actionCommandSchema.omit({ action: true });
export const rematchConsentSchema = z.strictObject({
  matchId: identifierSchema,
  commandId: commandIdSchema,
  consent: z.boolean(),
  expectedRoomVersion: versionSchema,
});
export const syncSchema = z.strictObject({
  scope: z.enum(['room', 'match']),
  id: identifierSchema,
  lastKnownVersion: versionSchema.optional(),
});
export type ActionCommand = z.infer<typeof actionCommandSchema>;

export const matchResultSchema = z.discriminatedUnion('reason', [
  z.strictObject({
    kind: z.literal('WIN'),
    reason: z.literal('LINE_COMPLETED'),
    winnerSeatIds: z.array(seatIdSchema).length(1),
    winningLines: z.array(z.array(cellSchema).min(3).max(7)).min(1).max(4),
    terminalVersion: versionSchema,
  }),
  z.strictObject({
    kind: z.literal('DRAW'),
    reason: z.literal('BOARD_FULL'),
    winnerSeatIds: z.array(seatIdSchema).length(0),
    winningLines: z.array(z.never()).length(0),
    terminalVersion: versionSchema,
  }),
  z.strictObject({
    kind: z.literal('WIN'),
    reason: z.enum(['RESIGNATION', 'DISCONNECT_FORFEIT']),
    winnerSeatIds: z.array(seatIdSchema).length(1),
    winningLines: z.array(z.never()).length(0),
    terminalVersion: versionSchema,
  }),
  z.strictObject({
    kind: z.literal('ABANDONED'),
    reason: z.enum(['BOTH_ABSENT', 'IDLE_TIMEOUT', 'TECHNICAL_CANCELLATION']),
    winnerSeatIds: z.array(seatIdSchema).length(0),
    winningLines: z.array(z.never()).length(0),
    terminalVersion: versionSchema,
  }),
]);
export type MatchResult = z.infer<typeof matchResultSchema>;
