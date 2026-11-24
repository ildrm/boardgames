import type { CSSProperties } from 'react';
import { SeatMark } from '../ui';
import { WinningLines, useBoardLabels } from './common';
import type { BoardProps } from './common';

export default function FourInRow({ match, enabled, animate, onMove }: BoardProps) {
  const { t, number, cellLabel } = useBoardLabels();
  const role = match.roster.find((seat) => seat.seatId === match.viewerSeatId)?.role;
  return <>
    <div className="fir-board" dir="ltr" role="group" aria-label={t('game.four-in-a-row')}>
      <div className="fir-columns">
        {Array.from({ length: 7 }, (_, col) => {
          const values = match.board.map((row) => row[col] ?? null);
          const landing = values.lastIndexOf(null);
          const legal = enabled && match.legalActions.some((action) => action.type === 'DROP_DISC' && action.payload.col === col);
          return <button className="fir-column" type="button" key={col}
            aria-label={landing < 0 ? t('board.full', { col: number.format(col + 1) }) : t('board.column', {
              col: number.format(col + 1), spaces: number.format(landing + 1),
            })}
            aria-disabled={!legal}
            onClick={() => { if (legal) onMove({ type: 'DROP_DISC', payload: { col } }); }}>
            <span className="fir-label" aria-hidden="true">{number.format(col + 1)}</span>
            {values.map((value, row) => {
              const last = match.lastMove?.row === row && match.lastMove.col === col;
              return <span className={'fir-slot' + (last ? ' latest' : '') + (last && animate ? ' animate-disc' : '')}
                style={{ '--drop-distance': (row + 1) * -100 + '%' } as CSSProperties}
                key={row} aria-hidden="true">
                {value ? <SeatMark role={value} /> : legal && landing === row && <span className="piece-preview"><SeatMark role={role} /></span>}
              </span>;
            })}
          </button>;
        })}
      </div>
      <div className="fir-winning"><WinningLines cells={match.winningLines} cols={7} rows={6} /></div>
    </div>
    <details className="board-inspection">
      <summary>{t('board.inspect')}</summary>
      <table>
        <caption className="sr-only">{t('game.four-in-a-row')}</caption>
        <tbody>
          {match.board.map((row, r) => <tr key={r}>{row.map((value, c) => <td key={c} aria-label={cellLabel(r, c, value)}>{value ?? '·'}</td>)}</tr>)}
        </tbody>
      </table>
    </details>
  </>;
}
