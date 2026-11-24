import { lazy } from 'react';

export const boardRegistry = new Map([
  ['tic-tac-toe:1:1', lazy(() => import('./TicTacToe'))],
  ['four-in-a-row:1:1', lazy(() => import('./FourInRow'))],
]);
