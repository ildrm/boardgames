import assert from 'node:assert/strict';
import test from 'node:test';
import { replay, type GameContext } from '@tablemate/game-engine';
import { hiddenInformationFixture, ManualClock } from '../src/index.ts';

for (const size of [3, 4]) {
  test(`test-only fixture isolates private views for ${size} simultaneous seats`, () => {
    const seats = Array.from({ length: size }, (_, i) => ({ seatId: `s${i}`, role: `r${i}` }));
    const random = () => {
      let n = 0;
      return { nextInt: () => ++n };
    };
    const context: GameContext = { seats, options: {}, serverTimeMs: 0, random: random() };
    const fresh = () => ({ ...context, random: random() });
    const game = hiddenInformationFixture;
    const start = game.initialize(context);
    assert.equal(game.getActivePlayers(start).length, size);
    assert.throws(() => game.initialize({ ...fresh(), seats: seats.slice(0, 2) }));
    assert.throws(() => game.getPlayerView(start, 'outsider'));
    assert.equal(game.getPlayerView(start, 's0').ownCard, 1);
    assert.equal(game.getPlayerView(start, 's1').ownCard, 2);
    assert.equal(Object.hasOwn(game.getPlayerView(start, 's0'), 'hands'), false);
    assert.equal(Object.hasOwn(game.getPlayerView(start, 's0'), 'seats'), false);
    const action = game.parseAction({ type: 'LOCK_CARD' });
    assert.deepEqual(game.getLegalActions(start, 's1'), [{ type: 'LOCK_CARD' }]);
    assert.throws(() => game.parseAction({ type: 'LOCK_CARD', card: 1 }));
    const first = game.applyAction(start, 's1', action, context);
    assert.deepEqual(first.domainEvents, [{ type: 'CARD_LOCKED', seatId: 's1' }]);
    assert.equal(game.getPlayerView(first.state, 's0').ownCard, 1);
    assert.deepEqual(game.validateAction(first.state, 's1', action), { ok: false, code: 'NOT_YOUR_TURN' });
    assert.equal(game.getActivePlayers(first.state).length, size - 1);
    const moves = seats.map(({ seatId }) => ({ seatId, action }));
    const final = replay(game, fresh(), moves);
    assert.deepEqual(game.getResult(final)?.winnerSeatIds, [`s${size - 1}`]);
    assert.equal(game.getActivePlayers(final).length, 0);
    assert.deepEqual(game.parseState(JSON.parse(JSON.stringify(final))), final);
  });
}

test('manual clock advances deterministically and rejects reversing time', () => {
  const clock = new ManualClock(50);
  clock.advance(120);
  assert.equal(clock.now(), 170);
  assert.throws(() => clock.advance(-2));
  assert.throws(() => clock.advance(Infinity));
});
