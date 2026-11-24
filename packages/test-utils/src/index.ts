import { GameError, type GameDefinition } from '@tablemate/game-engine';
import { z } from 'zod';

const actionSchema = z.strictObject({ type: z.literal('LOCK_CARD') });
const handSchema = z.strictObject({
  seatId: z.string().min(1).max(128),
  card: z.number().int().min(1).max(13),
  locked: z.boolean(),
});
const stateSchema = z.strictObject({
  hands: z.array(handSchema).min(3).max(4),
}).refine((state) => new Set(state.hands.map(({ seatId }) => seatId)).size === state.hands.length);

type State = z.infer<typeof stateSchema>;
type Action = z.infer<typeof actionSchema>;
type View = { ownCard: number; lockedSeatIds: string[] };

function findHand(state: State, seatId: string) {
  return state.hands.find((hand) => hand.seatId === seatId);
}

export const hiddenInformationFixture: GameDefinition<State, Action, View> = {
  id: 'hidden-information-fixture',
  rulesVersion: 1,
  stateSchemaVersion: 1,
  supportedPlayerCounts: [3, 4],
  capabilities: { hiddenInformation: true, randomness: true, simultaneousActions: true, teams: false },
  parseOptions: (raw) => z.strictObject({}).parse(raw),
  parseAction: (raw) => actionSchema.parse(raw),
  parseState: (raw) => stateSchema.parse(raw),
  initialize(context) {
    const { seats, random } = context;
    if (!this.supportedPlayerCounts.includes(seats.length) || !random) throw new GameError('INVALID_SETUP');
    return stateSchema.parse({
      hands: seats.map(({ seatId }) => ({ seatId, card: random.nextInt(1, 14), locked: false })),
    });
  },
  getActivePlayers: ({ hands }) => hands.filter((hand) => !hand.locked).map((hand) => hand.seatId),
  getLegalActions: (state, seatId) => {
    const hand = findHand(state, seatId);
    return hand && !hand.locked ? [{ type: 'LOCK_CARD' }] : [];
  },
  validateAction(state, seatId) {
    return this.getLegalActions(state, seatId).length
      ? { ok: true }
      : { ok: false, code: 'NOT_YOUR_TURN' };
  },
  applyAction(state, seatId, action) {
    const result = this.validateAction(state, seatId, action);
    if (!result.ok) throw new GameError(result.code);
    return {
      state: { hands: state.hands.map((hand) => hand.seatId === seatId ? { ...hand, locked: true } : hand) },
      domainEvents: [{ type: 'CARD_LOCKED', seatId }],
    };
  },
  getResult({ hands }) {
    if (hands.some((hand) => !hand.locked)) return null;
    const high = Math.max(...hands.map(({ card }) => card));
    return {
      kind: 'WIN',
      reason: 'HIGHEST_CARD',
      winnerSeatIds: hands.filter(({ card }) => card === high).map(({ seatId }) => seatId),
    };
  },
  getPlayerView(state, seatId) {
    const hand = findHand(state, seatId);
    if (!hand) throw new GameError('NOT_FOUND_OR_FORBIDDEN');
    return { ownCard: hand.card, lockedSeatIds: state.hands.filter(({ locked }) => locked).map((entry) => entry.seatId) };
  },
};

export class ManualClock {
  constructor(private current = 0) {
    if (!Number.isSafeInteger(current) || current < 0) throw new RangeError('Invalid clock timestamp');
  }

  now() {
    return this.current;
  }

  advance(elapsed: number) {
    if (!Number.isSafeInteger(elapsed) || elapsed < 0 || !Number.isSafeInteger(this.current + elapsed)) {
      throw new RangeError('Invalid clock offset');
    }
    this.current += elapsed;
  }
}
