import { type Cell, type PlaceMark, placeMarkSchema } from '@tablemate/contracts';
import { defineAlternatingBoard } from '@tablemate/game-engine';

const corners = [0, 1, 2];
const lines: readonly (readonly Cell[])[] = [
  ...corners.map((row) => corners.map((col) => ({ row, col }))),
  ...corners.map((col) => corners.map((row) => ({ row, col }))),
  corners.map((row) => ({ row, col: row })),
  corners.map((row) => ({ row, col: 2 - row })),
];

export const ticTacToe = defineAlternatingBoard({
  id: 'tic-tac-toe',
  metadata: { title: 'Tic-Tac-Toe', description: 'Place three marks in a line on a 3 × 3 board.' },
  rows: 3,
  cols: 3,
  roles: ['X', 'O'],
  actionSchema: placeMarkSchema,
  unavailableCode: 'CELL_OCCUPIED',
  target(board, { payload }) {
    return board[payload.row]?.[payload.col] === null ? payload : null;
  },
  legalActions(board) {
    const actions: PlaceMark[] = [];
    for (const row of corners) {
      for (const col of corners) {
        if (board[row]?.[col] === null) actions.push({ type: 'PLACE_MARK', payload: { row, col } });
      }
    }
    return actions;
  },
  winningLines(board, _placed, piece) {
    return lines.filter((line) => line.every(({ row, col }) => board[row]?.[col] === piece));
  },
});
