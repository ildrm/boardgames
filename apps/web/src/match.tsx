import { Suspense, useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CirclePause, Crown, Flag, WifiOff } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, request } from './api';
import type { Action, MatchMutation, MatchView, RoomMutation, RoomView } from './api';
import { boardRegistry } from './boards/registry';
import { useBoardLabels } from './boards/common';
import { isolated } from './i18n';
import { useRealtime } from './realtime';
import { PlayerSeat, SeriesScore } from './room';
import { BackLink, Dialog, ErrorNotice, Loading, RulesButton, errorCode } from './ui';
import { playMoveTone, readPreference, unlockAudio } from './prefs';

type MatchOperation = 'move' | 'resign' | 'start' | 'consent';
type Command = {
  operation: MatchOperation;
  path: string;
  body: Record<string, unknown>;
  retryAt?: number;
};

function Countdown({ deadline, serverTime }: { deadline: string; serverTime?: string }) {
  const { t, i18n } = useTranslation();
  const [, setTick] = useState(0);
  const [measure, setMeasure] = useState({ deadline, serverTime, origin: performance.now(), time: Date.now() });
  useEffect(() => {
    const timer = setInterval(() => setTick((value) => value + 1), 500);
    return () => clearInterval(timer);
  }, []);
  if (measure.deadline !== deadline || measure.serverTime !== serverTime) {
    setMeasure({ deadline, serverTime, origin: performance.now(), time: Date.now() });
  }
  const now = measure.serverTime ? Date.parse(measure.serverTime) : measure.time;
  const remainder = Math.max(0, Math.ceil((Date.parse(deadline) - now - (performance.now() - measure.origin)) / 1000));
  const integer = new Intl.NumberFormat(i18n.resolvedLanguage, { minimumIntegerDigits: 2 });
  return <p className="countdown" aria-live="off">{t('match.clock')} <strong dir="ltr">{integer.format(Math.floor(remainder / 60))}:{integer.format(remainder % 60)}</strong></p>;
}

export function Match() {
  const { t } = useTranslation();
  const { cellLabel } = useBoardLabels();
  const { matchId = '' } = useParams();
  const state = useRealtime<MatchView>('match', matchId);
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [retry, setRetry] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmResign, setConfirmResign] = useState(false);
  const storedCommand = useRef<Command | null>(null);
  const executing = useRef(false);
  const lastSound = useRef<string | null>(null);
  const view = state.view;
  const roomState = useRealtime<RoomView>('room', view?.result ? view.roomId : '');
  const room = roomState.view;
  const hasResult = !!view?.result;

  useEffect(() => {
    if (!view || !state.animate || !view.moveCount || readPreference('sound') !== 'on') return;
    const key = view.matchId + ':' + view.moveCount;
    if (lastSound.current === key) return;
    lastSound.current = key;
    playMoveTone(view.gameId === 'four-in-a-row');
  }, [view, state.animate]);

  async function execute(command: Command) {
    if (executing.current || !state.live || (command.retryAt ?? 0) > Date.now()) return;
    executing.current = true;
    storedCommand.current = command;
    setError(null);
    setRetry(false);
    setPending(true);
    try {
      if (command.operation === 'consent') {
        const output = await request<RoomMutation>(command.path, { method: 'POST', body: command.body });
        roomState.observe(output.roomView);
        if (!output.roomView) roomState.sync();
      } else {
        const output = await request<MatchMutation>(command.path, { method: 'POST', body: command.body });
        if (command.operation === 'start') void navigate('/matches/' + output.matchId, { replace: true });
        else {
          state.observe(output.playerView);
          if (!output.playerView) state.sync();
        }
      }
      storedCommand.current = null;
    } catch (cause) {
      setError(errorCode(cause));
      if (cause instanceof ApiError && cause.retryable) {
        command.retryAt = Date.now() + (cause.retryAfterMs ?? 0);
        setRetry(true);
      } else {
        storedCommand.current = null;
      }
      state.sync();
      if (hasResult) roomState.sync();
    } finally { setPending(false); executing.current = false; setConfirmResign(false); }
  }

  function act(operation: MatchOperation, payload?: Action | boolean) {
    if (!view || pending || retry || !state.live) return;
    if (readPreference('sound') === 'on') unlockAudio();
    const commandId = crypto.randomUUID();
    const matchPath = '/matches/' + matchId;
    if (operation === 'start' || operation === 'consent') {
      if (!room || !roomState.live) return;
      void execute(operation === 'start' ?
        { operation, path: '/rooms/' + room.roomId + '/start', body: { commandId, expectedRoomVersion: room.roomVersion } } :
        { operation, path: matchPath + '/rematch-consent', body: { commandId, expectedRoomVersion: room.roomVersion, consent: payload } });
    } else {
      void execute({ operation, path: matchPath + (operation === 'move' ? '/actions' : '/resign'), body: {
        commandId, expectedVersion: view.stateVersion, ...(operation === 'move' ? { action: payload } : {}),
      } });
    }
  }

  if (!view || view.matchId !== matchId) return <main className="shell narrow" id="main-content">
    <BackLink />
    {state.error ? <>
      <ErrorNotice code={state.error} />
      {state.error === 'SERVICE_UNAVAILABLE' && <button type="button" className="button secondary" onClick={state.retrySocket}>{t('common.retry')}</button>}
    </> : <Loading />}
  </main>;
  if (room?.currentMatchId && room.currentMatchId !== matchId && room.lastMatchId === matchId && roomState.live) {
    return <Navigate replace to={'/matches/' + room.currentMatchId} />;
  }

  const Board = boardRegistry.get([view.gameId, view.rulesVersion, view.stateSchemaVersion].join(':'));
  const isHost = view.hostSeatId === view.viewerSeatId;
  const turn = view.roster.find((player) => player.seatId === view.turnSeatId);
  const opponent = view.roster.find((player) => player.seatId !== view.viewerSeatId);
  const winner = view.roster.find((player) => view.result?.winnerSeatIds.includes(player.seatId));
  const canPlay = !!Board && state.live && view.status === 'ACTIVE' && view.activeSeatIds.includes(view.viewerSeatId) && !pending && !retry;
  const pause = view.status === 'PAUSED';
  const yourTurn = turn?.seatId === view.viewerSeatId;
  const title = t('game.' + view.gameId);
  const status = hasResult ? t('match.finished')
    : !state.live ? t('common.reconnect')
    : pause ? t('match.paused')
    : pending && storedCommand.current?.operation === 'move' ? t('match.pending')
    : yourTurn ? t('match.turn')
    : turn ? t('match.otherTurn', { name: isolated(turn.nickname) }) : t('match.waiting');
  const resultMessage = view.result?.kind === 'DRAW' ? t('result.draw')
    : view.result?.kind === 'ABANDONED' ? t('result.abandoned')
    : winner?.seatId === view.viewerSeatId ? t('result.win')
    : t('result.loss', { name: isolated(winner?.nickname ?? '') });
  const mayRematch = view.result?.kind !== 'ABANDONED' && roomState.live && room?.lastMatchId === matchId
    && room.seats.some((seat) => seat.seatId === opponent?.seatId);
  const accepted = room?.rematchConsents.includes(view.viewerSeatId);
  const otherAccepted = !!opponent && room?.rematchConsents.includes(opponent.seatId);
  const mayStart = isHost && room?.readiness === 'REMATCH_READY';

  return <main className="shell match-page" id="main-content">
    <div className="page-top"><BackLink /><RulesButton gameId={view.gameId} /></div>
    <section className="match-heading">
      <h1>{title}</h1>
      <div className="seat-grid match-seats" aria-label={t('room.seats')}>
        {view.roster.map((player) => <PlayerSeat key={player.seatId} seat={player} own={player.seatId === view.viewerSeatId}
          active={!hasResult && state.live && !pause && player.seatId === view.turnSeatId} />)}
      </div>
    </section>
    <section className="match-table">
      <div className={'turn-banner' + (canPlay ? ' your-turn' : '') + (pause ? ' pause' : '')}>
        <p role="status">
          {!state.live ? <WifiOff size={19} aria-hidden="true" /> : pause ? <CirclePause size={19} aria-hidden="true" /> : <span className="turn-indicator" aria-hidden="true" />}
          <strong>{status}</strong>
        </p>
        {state.live && pause && view.applicableDeadline && <Countdown deadline={view.applicableDeadline} serverTime={view.serverTime} />}
      </div>
      {state.error && <ErrorNotice code={state.error} />}
      {error && <ErrorNotice code={error} />}
      {retry && storedCommand.current && <button type="button" className="button secondary" disabled={!state.live || pending} onClick={() => {
        if (storedCommand.current) void execute(storedCommand.current);
      }}>{t('common.retry')}</button>}
      <div className="live-board">
        {Board ? <Suspense fallback={<Loading />}><Board match={view} animate={state.animate} enabled={canPlay} onMove={(action) => act('move', action)} /></Suspense>
          : <p className="notice error" role="alert">{t('common.unavailable')}</p>}
      </div>
      {view.lastMove && <p className="last-move" aria-live="polite">{t('board.lastMove', { cell: cellLabel(view.lastMove.row, view.lastMove.col, view.board[view.lastMove.row]?.[view.lastMove.col] ?? null) })}</p>}
      {view.result ? <section className="result-panel">
        <div className="result-copy"><Crown size={27} aria-hidden="true" />
          <div><h2 role="status">{resultMessage}</h2><p>{t('result.reason.' + view.result.reason, { defaultValue: t('match.finished') })}</p></div>
        </div>
        {room?.lastMatchId === matchId && <SeriesScore room={room} />}
        {mayRematch && <div className="result-consent">
          {accepted && !mayStart && <p role="status">{otherAccepted ?
            t(isHost ? 'result.waitingForPresence' : 'result.waitingForHost') : t('result.waiting', { name: isolated(opponent?.nickname ?? '') })}</p>}
          <div className="room-actions">
            {!accepted && <button className="button primary" type="button" disabled={pending || retry} onClick={() => act('consent', true)}>{t(otherAccepted ? 'result.accept' : 'result.request')}</button>}
            {mayStart && <button className="button primary" type="button" disabled={pending || retry} onClick={() => act('start')}>{t('result.start')}<ArrowUpRight size={17} /></button>}
            {(accepted || otherAccepted) && <button className="quiet-button" type="button" disabled={pending || retry} onClick={() => act('consent', false)}>{t('result.decline')}</button>}
          </div>
        </div>}
        <Link className="button secondary" to={roomState.live ? '/rooms/' + view.roomId : '/'}>{t(roomState.live ? 'room.return' : 'common.back')}</Link>
      </section> :
        <div className="match-bottom"><Link to={'/rooms/' + view.roomId} className="quiet-button">{t('room.return')}</Link>
          <button type="button" className="quiet-button danger-text" disabled={!state.live || pending || retry} onClick={(event) => { event.currentTarget.focus(); setConfirmResign(true); }}><Flag size={15} /> {t('match.resign')}</button>
        </div>}
    </section>
    {confirmResign && <Dialog title={t('match.resign')} onClose={() => setConfirmResign(false)}>
      <p>{t('match.resignPrompt')}</p>
      <div className="dialog-actions">
        <button type="button" className="button secondary" onClick={() => setConfirmResign(false)}>{t('match.keep')}</button>
        <button type="button" className="button danger" disabled={pending} onClick={() => act('resign')}>{t('match.resign')}</button>
      </div>
    </Dialog>}
  </main>;
}
