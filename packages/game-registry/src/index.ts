import type { RegisteredGame } from '@tablemate/game-engine';
import { fourInARow } from '@tablemate/game-four-in-a-row';
import { ticTacToe } from '@tablemate/game-tic-tac-toe';

export type { RegisteredGame } from '@tablemate/game-engine';

export const games: readonly RegisteredGame[] = Object.freeze([ticTacToe, fourInARow]);
const byVersion = new Map(games.map((game) => [`${game.id}@${game.rulesVersion}`, game]));

export function getGame(id: string, rulesVersion: number): RegisteredGame | undefined {
  return byVersion.get(`${id}@${rulesVersion}`);
}
