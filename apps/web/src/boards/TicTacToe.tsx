import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { SeatMark } from '../ui';
import { WinningLines, useBoardLabels } from './common';
import type { BoardProps } from './common';

const directions: Record<string, [number, number]> = {
  ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1],
};

export default function TicTacToe({ match, enabled, animate, onMove }: BoardProps) {
  const { t, cellLabel } = useBoardLabels();
  const [focus, setFocus] = useState(0);
  const buttons = useRef<(HTMLButtonElement | null)[]>([]);
  const role = match.roster.find((seat) => seat.seatId === match.viewerSeatId)?.role;
  function navigate(event: KeyboardEvent, row: number, col: number) {
    const vector = directions[event.key];
    if (!vector) return;
    event.preventDefault();
    const nextRow = Math.max(0, Math.min(2, row + vector[0]));
    const nextCol = Math.max(0, Math.min(2, col + vector[1]));
    buttons.current[nextRow * 3 + nextCol]?.focus();
  }
  return <div className="ttt-frame" dir="ltr">
    <div className="ttt-grid" role="grid" aria-label={t('game.tic-tac-toe')}>
      {match.board.map((row, r) => <div key={r} role="row" className="ttt-row">
        {row.map((value, c) => {
          const index = r * 3 + c;
          const last = match.lastMove?.row === r && match.lastMove.col === c;
          const legal = enabled && match.legalActions.some((action) => action.type === 'PLACE_MARK' && action.payload.row === r && action.payload.col === c);
          return <div key={c} role="gridcell" className="ttt-cell">
            <button
              type="button" ref={(element) => { buttons.current[index] = element; }} tabIndex={focus === index ? 0 : -1}
              className={'ttt-slot' + (last ? ' latest' : '') + (last && animate ? ' animate-mark' : '')}
              aria-label={cellLabel(r, c, value)} aria-disabled={!legal}
              onFocus={() => setFocus(index)} onKeyDown={(event) => navigate(event, r, c)}
              onClick={() => { if (legal) onMove({ type: 'PLACE_MARK', payload: { row: r, col: c } }); }}
            >
              {value ? <SeatMark role={value} /> : legal && <span className="piece-preview"><SeatMark role={role} /></span>}
            </button>
          </div>;
        })}
      </div>)}
      <WinningLines cells={match.winningLines} cols={3} rows={3} />
    </div>
  </div>;
}
