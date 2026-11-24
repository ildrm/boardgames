import { useTranslation } from 'react-i18next';
import type { Action, Cell, MatchView } from '../api';

export type BoardProps = {
  match: MatchView;
  enabled: boolean;
  animate: boolean;
  onMove: (action: Action) => void;
};

export function useBoardLabels() {
  const { t, i18n } = useTranslation();
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const cellLabel = (row: number, col: number, value: string | null) => t('board.cell', {
    row: number.format(row + 1), col: number.format(col + 1), occupant: value ?? t('board.empty'),
  });
  return { t, number, cellLabel };
}

export function WinningLines({ cells, cols, rows }: { cells: Cell[][]; cols: number; rows: number }) {
  if (!cells.length) return null;
  return <svg className="winning-lines" viewBox={'0 0 ' + cols + ' ' + rows} preserveAspectRatio="none" aria-hidden="true">
    {cells.map((line) => {
      const first = line[0];
      const last = line.at(-1);
      if (!first || !last) return null;
      return <line key={first.row + ':' + first.col + ':' + last.row + ':' + last.col}
        x1={first.col + .5} y1={first.row + .5} x2={last.col + .5} y2={last.row + .5} />;
    })}
  </svg>;
}
