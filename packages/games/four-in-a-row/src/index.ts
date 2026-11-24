import { type Cell, type DropDisc, dropDiscSchema } from '@tablemate/contracts';
import { defineAlternatingBoard } from '@tablemate/game-engine';

const axes = [[0, 1], [1, 0], [1, 1], [1, -1]] as const;

export const fourInARow = defineAlternatingBoard({
  id: 'four-in-a-row',
  metadata: { title: 'Four in a Row', description: 'Drop discs and connect four to win.' },
  rows: 6,
  cols: 7,
  roles: ['A', 'B'],
  actionSchema: dropDiscSchema,
  unavailableCode: 'COLUMN_FULL',
  target(board, { payload: { col } }) {
    for (let row = 5; row >= 0; row--) {
      if (board[row]?.[col] === null) return { row, col };
    }
    return null;
  },
  legalActions(board) {
    const actions: DropDisc[] = [];
    for (let col = 0; col < 7; col++) {
      if (board[0]?.[col] === null) actions.push({ type: 'DROP_DISC', payload: { col } });
    }
    return actions;
  },
  winningLines(board, placed, piece) {
    const wins: Cell[][] = [];
    for (const [dr, dc] of axes) {
      const line: Cell[] = [placed];
      for (const direction of [-1, 1]) {
        const stepRow = dr * direction;
        const stepCol = dc * direction;
        let row = placed.row + stepRow;
        let col = placed.col + stepCol;
        while (board[row]?.[col] === piece) {
          line.push({ row, col });
          row += stepRow;
          col += stepCol;
        }
      }
      if (line.length >= 4) wins.push(line.sort((a, b) => a.row - b.row || a.col - b.col));
    }
    return wins;
  },
});
