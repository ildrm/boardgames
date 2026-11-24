import assert from 'node:assert/strict';
import test from 'node:test';
import type { Cell, GameAction, GameState } from '@tablemate/contracts';
import { replay, type GameContext } from '@tablemate/game-engine';
import { games, getGame, type RegisteredGame } from '../src/index.ts';

const seats = {
  'tic-tac-toe': [{ seatId: 'open', role: 'X' }, { seatId: 'reply', role: 'O' }],
  'four-in-a-row': [{ seatId: 'open', role: 'A' }, { seatId: 'reply', role: 'B' }],
};
function context(id: keyof typeof seats): GameContext {
  return { seats: seats[id].toReversed(), options: {}, serverTimeMs: 0 };
}
function classicGame(id: keyof typeof seats): RegisteredGame {
  const game = getGame(id, 1);
  assert(game, 'Version 1 game is registered');
  return game;
}

const place = (index: number): GameAction => ({
  type: 'PLACE_MARK', payload: { row: Math.floor(index / 3), col: index % 3 },
});
const drop = (col: number): GameAction => ({ type: 'DROP_DISC', payload: { col } });

function history(actions: readonly GameAction[]) {
  return actions.map((action, i) => ({ seatId: i % 2 === 0 ? 'open' : 'reply', action }));
}

test('public registration pins versions and excludes the contract fixture', () => {
  assert.deepEqual(games.map(({ id }) => id), ['tic-tac-toe', 'four-in-a-row']);
  assert.equal(getGame('tic-tac-toe', 2), undefined);
  assert.equal(getGame('test-hidden-information', 1), undefined);
});

test('TTT accepts strict bounded actions, derives roles and preserves old snapshots', () => {
  const game = classicGame('tic-tac-toe');
  const ctx = context('tic-tac-toe');
  const empty = game.initialize(ctx);
  empty.board.forEach(Object.freeze);
  Object.freeze(empty.board);
  Object.freeze(empty.history);
  Object.freeze(empty);
  assert.deepEqual(game.getActivePlayers(empty), ['open']);
  assert.deepEqual(game.getLegalActions(empty, 'reply'), []);
  const after = game.applyAction(empty, 'open', game.parseAction(place(0)), ctx).state;
  assert.equal(empty.board[0]?.[0], null);
  assert.equal(after.board[0]?.[0], 'X');
  assert.deepEqual(game.getActivePlayers(after), ['reply']);
  assert.deepEqual(game.validateAction(after, 'reply', place(0)), { ok: false, code: 'CELL_OCCUPIED' });
  assert.deepEqual(game.validateAction(after, 'open', place(1)), { ok: false, code: 'NOT_YOUR_TURN' });
  assert.throws(() => game.getPlayerView(after, 'unseated'));
  assert.equal(Object.hasOwn(game.getPlayerView(after, 'open'), 'history'), false);
  assert.equal(Object.hasOwn(game.getPlayerView(after, 'open'), 'seats'), false);
  for (const row of [-1, 3, 0.5, '0', null]) {
    assert.throws(() => game.parseAction({ type: 'PLACE_MARK', payload: { row, col: 1 } }));
  }
  assert.throws(() => game.parseAction({ type: 'PLACE_MARK', payload: { row: 0, col: 0, role: 'X' } }));
  assert.throws(() => game.parseOptions({ timer: 10 }));
});

const tttCases = [
  { moves: [0, 3, 1, 4, 2], winner: 'open', lengths: [3] },
  { moves: [0, 1, 3, 2, 6], winner: 'open', lengths: [3] },
  { moves: [0, 1, 4, 2, 8], winner: 'open', lengths: [3] },
  { moves: [2, 0, 4, 1, 6], winner: 'open', lengths: [3] },
  { moves: [0, 3, 1, 4, 8, 5], winner: 'reply', lengths: [3] },
  { moves: [0, 1, 2, 3, 6, 5, 8, 7, 4], winner: 'open', lengths: [3, 3] },
  { moves: [0, 1, 2, 4, 3, 5, 7, 6, 8], winner: null, lengths: [] },
];

const firCases = [
  { moves: [0, 0, 1, 1, 2, 2, 3], winner: 'open', lengths: [4] },
  { moves: [0, 1, 0, 1, 0, 1, 0], winner: 'open', lengths: [4] },
  { moves: [6, 0, 6, 1, 5, 2, 5, 3], winner: 'reply', lengths: [4] },
  { moves: [0, 1, 1, 2, 4, 2, 2, 3, 4, 3, 5, 3, 3], winner: 'open', lengths: [4] },
  { moves: [6, 5, 5, 4, 2, 4, 4, 3, 2, 3, 1, 3, 3], winner: 'open', lengths: [4] },
  { moves: [0, 6, 1, 6, 3, 5, 4, 5, 2], winner: 'open', lengths: [5] },
  { moves: [0, 0, 1, 1, 3, 3, 4, 4, 5, 5, 2], winner: 'open', lengths: [6] },
  { moves: [0, 0, 1, 1, 2, 2, 4, 4, 5, 5, 6, 6, 3], winner: 'open', lengths: [7] },
  { moves: [1, 5, 5, 2, 3, 4, 3, 0, 3, 6, 4, 4, 4, 0, 2], winner: 'open', lengths: [4, 4] },
  {
    moves: [3, 1, 6, 5, 4, 5, 5, 4, 4, 3, 4, 2, 3, 1, 1, 1, 2, 2, 1, 3, 6, 1, 5, 3, 0, 6, 6, 0, 4, 3, 6, 0, 6, 4, 2, 0, 0, 5, 2, 5, 2, 0],
    winner: null, lengths: [],
  },
  {
    moves: [2, 4, 3, 3, 4, 0, 1, 4, 0, 1, 3, 5, 6, 4, 0, 2, 1, 5, 0, 0, 0, 6, 1, 2, 6, 2, 6, 1, 6, 1, 3, 5, 4, 4, 5, 6, 2, 2, 3, 5, 5, 3],
    winner: 'reply', lengths: [4],
  },
];

for (const [id, cases, actionOf] of [
  ['tic-tac-toe', tttCases, place],
  ['four-in-a-row', firCases, drop],
] as const) {
  test(`${id} replays each documented first terminal outcome`, () => {
    const game = classicGame(id);
    const ctx = context(id);
    for (const fixture of cases) {
      const moves = history(fixture.moves.map(actionOf));
      const state = replay(game, ctx, moves);
      assert.equal(state.moveCount, fixture.moves.length);
      assert.deepEqual(game.getResult(state), {
        kind: fixture.winner ? 'WIN' : 'DRAW',
        reason: fixture.winner ? 'LINE_COMPLETED' : 'BOARD_FULL',
        winnerSeatIds: fixture.winner ? [fixture.winner] : [],
        winningLines: state.winningLines,
      });
      assert.deepEqual(state.winningLines.map((line) => line.length), fixture.lengths);
      assert.deepEqual(game.getActivePlayers(state), []);
      assert.deepEqual(game.validateAction(state, 'open', actionOf(0)), { ok: false, code: 'MATCH_ENDED' });
      assert.deepEqual(game.parseState(JSON.parse(JSON.stringify(state))), state);
      assert.throws(() => replay(game, ctx, [...moves, { seatId: 'open', action: actionOf(0) }]));
    }
  });
}

test('FIR uses the bottom slot, rejects a full column and preserves the next valid turn', () => {
  const game = classicGame('four-in-a-row');
  const ctx = context('four-in-a-row');
  const state = replay(game, ctx, history([0, 0, 0, 0, 0, 0].map(drop)));
  assert.deepEqual(state.lastMove, { row: 0, col: 0, seatId: 'reply' });
  assert.deepEqual(state.board.map((row) => row[0]), ['B', 'A', 'B', 'A', 'B', 'A']);
  assert.deepEqual(game.validateAction(state, 'open', drop(0)), { ok: false, code: 'COLUMN_FULL' });
  const next = game.applyAction(state, 'open', drop(6), ctx).state;
  assert.deepEqual(next.lastMove, { row: 5, col: 6, seatId: 'open' });
  assert.throws(() => game.parseAction({ type: 'DROP_DISC', payload: { col: 2, row: 5 } }));
});

test('hydration rejects inconsistent persisted state and history corruption', () => {
  const game = classicGame('four-in-a-row');
  const ctx = context('four-in-a-row');
  const state = replay(game, ctx, history([3, 3, 6].map(drop)));
  const snapshot = () => JSON.parse(JSON.stringify(state));
  const wrongBoard = snapshot();
  wrongBoard.board[5][6] = null;
  wrongBoard.board[4][6] = 'A';
  assert.throws(() => game.parseState(wrongBoard));
  const wrongHistory = snapshot();
  wrongHistory.history[0].seatId = 'reply';
  assert.throws(() => game.parseState(wrongHistory));
  const wrongTurn = snapshot();
  wrongTurn.turnSeatId = 'open';
  assert.throws(() => game.parseState(wrongTurn));
  assert.throws(() => game.parseState({ ...snapshot(), board: [['A']] }));
  assert.throws(() => game.parseState({ ...snapshot(), lastMove: null }));
});

const masks = [7, 56, 448, 73, 146, 292, 273, 84];
const expectedTttLines: readonly (readonly Cell[])[] = masks.map((mask) =>
  Array.from({ length: 9 }, (_, index) => index).filter((index) => Boolean(mask & (1 << index)))
    .map((index) => ({ row: Math.floor(index / 3), col: index % 3 })),
);

test('TTT visits all legal histories and agrees with a bitmask oracle at every node', () => {
  const game = classicGame('tic-tac-toe');
  const ctx = context('tic-tac-toe');
  let nodes = 0;
  let completed = 0;
  const observedLines = new Map<string, Set<number>>([['open', new Set()], ['reply', new Set()]]);
  function visit(state: GameState, x: number, o: number, caseDepth: number) {
    nodes++;
    const active = caseDepth % 2 === 0 ? 'open' : 'reply';
    const previous = active === 'open' ? 'reply' : 'open';
    const previousMask = previous === 'open' ? x : o;
    const matching = masks.flatMap((mask, i) => (previousMask & mask) === mask ? [i] : []);
    const result = game.getResult(state);
    if (matching.length || caseDepth === 9) {
      completed++;
      assert.equal(result?.kind, matching.length ? 'WIN' : 'DRAW');
      assert.deepEqual(result.winnerSeatIds, matching.length ? [previous] : []);
      assert.deepEqual(result.winningLines, matching.map((i) => expectedTttLines[i]));
      for (const i of matching) observedLines.get(previous)?.add(i);
      assert.deepEqual(game.getActivePlayers(state), []);
      assert.deepEqual(game.getLegalActions(state, previous), []);
      return;
    }

    assert.equal(result, null);
    assert.deepEqual(game.getActivePlayers(state), [active]);
    const emptyIndices = Array.from({ length: 9 }, (_, i) => i).filter((i) => !((x | o) & 1 << i));
    assert.deepEqual(game.getLegalActions(state, active), emptyIndices.map(place));
    for (const i of emptyIndices) {
      const next = game.applyAction(state, active, place(i), ctx).state;
      const bit = 1 << i;
      visit(next, active === 'open' ? x | bit : x, active === 'reply' ? o | bit : o, caseDepth + 1);
    }
  }
  visit(game.initialize(ctx), 0, 0, 0);
  assert.deepEqual([nodes, completed], [549946, 255168]);
  assert.equal(observedLines.get('open')?.size, 8);
  assert.equal(observedLines.get('reply')?.size, 8);
});

function oracleFIR(board: GameState['board']) {
  const winners = new Set<string>();
  const windows: Cell[][] = [];
  for (let row = 0; row < 6; row++) {
    for (let col = 0; col < 7; col++) {
      const p = board[row]?.[col];
      if (!p) continue;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [-1, 1]] as const) {
        const cells = [0, 1, 2, 3].map((n) => ({ row: row + n * dr, col: col + n * dc }));
        if (cells.every((cell) => board[cell.row]?.[cell.col] === p)) {
          winners.add(p);
          windows.push(cells);
        }
      }
    }
  }
  return { winners, windows };
}

test('FIR seeded legal sequences match all-board oracle and horizontal reflection', () => {
  const game = classicGame('four-in-a-row');
  const ctx = context('four-in-a-row');
  let seed = 0x927b3d7;
  function pick(limit: number): number {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % limit;
  }
  const key = (c: Cell) => c.row * 7 + c.col;
  const runKeys = (lines: readonly (readonly Cell[])[]) => lines.map((line) => line.map(key).sort((a, b) => a - b).join(',')).sort();
  for (let sample = 0; sample < 500; sample++) {
    let state = game.initialize(ctx);
    let mirror = game.initialize(ctx);
    while (state.turnSeatId) {
      const activeSeat = state.turnSeatId;
      const cols = Array.from({ length: 7 }, (_, i) => i).filter((i) => state.board[0]?.[i] === null);
      assert.deepEqual(game.getLegalActions(state, activeSeat), cols.map(drop));
      const col = cols[pick(cols.length)];
      assert.notEqual(col, undefined);
      state = game.applyAction(state, activeSeat, drop(col!), ctx).state;
      mirror = game.applyAction(mirror, activeSeat, drop(6 - col!), ctx).state;
      assert.deepEqual(mirror.board, state.board.map((r) => [...r].reverse()));
      const { winners, windows } = oracleFIR(state.board);
      for (let c = 0; c < 7; c++) {
        const fromBottom = state.board.map((r) => r[c]).reverse();
        const firstEmpty = fromBottom.indexOf(null);
        if (firstEmpty >= 0) assert(fromBottom.slice(firstEmpty).every((piece) => piece === null));
      }
      assert(winners.size <= 1);
      const result = game.getResult(state);
      const role = activeSeat === 'open' ? 'A' : 'B';
      assert.equal(result?.kind, winners.has(role) ? 'WIN' : state.moveCount === 42 ? 'DRAW' : undefined);
      assert.equal(oracleFIR(mirror.board).winners.has(role), winners.has(role));
      assert.equal(game.getResult(mirror)?.kind, result?.kind);
      for (const window of windows) {
        assert(state.winningLines.some((line) => window.every((cell) => line.some((run) => key(run) === key(cell)))));
      }
      assert.deepEqual(runKeys(mirror.winningLines.map((line) => line.map((c) => ({ row: c.row, col: 6 - c.col })))), runKeys(state.winningLines));
    }
    assert.deepEqual(game.parseState(JSON.parse(JSON.stringify(state))), state);
  }
});
