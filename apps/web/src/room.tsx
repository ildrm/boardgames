import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CircleDashed, Clipboard, Link2, LockKeyhole, Share2, UserRound, Wifi, WifiOff } from 'lucide-react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { ApiError, request } from './api';
import type { MatchMutation, RoomMutation, RoomView, Seat } from './api';
import { GameArt } from './art';
import { identityKey, invitations } from './catalog';
import { useRealtime } from './realtime';
import { BackLink, Dialog, ErrorNotice, Loading, RulesButton, SeatMark, errorCode } from './ui';

export function SeriesScore({ room }: { room: RoomView }) {
  const { t, i18n } = useTranslation();
  if (!room.series.draws && !Object.values(room.series.wins).some((wins) => wins > 0)) return null;
  const number = new Intl.NumberFormat(i18n.resolvedLanguage);
  const names = room.seats
    .map((seat) => (seat.seatId === room.viewerSeatId ? t('room.you') : '\u2068' + seat.nickname + '\u2069') + ' ' + number.format(room.series.wins[seat.seatId] ?? 0))
    .join(' / ');
  return <p className="series-score">{t('room.series', { names, draws: number.format(room.series.draws) })}</p>;
}

export function PlayerSeat({ seat, own, active = false }: { seat?: Seat; own: boolean; active?: boolean }) {
  const { t } = useTranslation();
  const PresenceIcon = seat?.presence === 'CONNECTED' ? Wifi : seat?.presence === 'UNKNOWN' ? CircleDashed : WifiOff;
  return <div className={'player-seat' + (active ? ' current-seat' : '') + (!seat ? ' empty-seat' : '')}>
    <span className="seat-avatar">{seat?.role ? <SeatMark role={seat.role} /> :
      seat ? <UserRound size={24} aria-hidden="true" /> : <CircleDashed size={24} aria-hidden="true" />}</span>
    <div className="seat-caption">
      <strong>{seat ? <bdi>{seat.nickname}</bdi> : t('room.openSeat')}</strong>
      <small>{own && t('room.you') + ' · '}{t(seat?.isHost ? 'room.host' : 'room.guest')}{seat?.role && <> · <bdi>{seat.role}</bdi></>}</small>
      {seat && <span className="presence"><PresenceIcon size={13} aria-hidden="true" /> {t('presence.' + seat.presence)}</span>}
    </div>
  </div>;
}

type Command = { operation: string; path: string; body: { commandId: string; expectedRoomVersion: string }; retryAt?: number };

export function Room() {
  const { t, i18n } = useTranslation();
  const { roomId = '' } = useParams();
  const state = useRealtime<RoomView>('room', roomId);
  const navigate = useNavigate();
  const query = useQueryClient();
  const [invite, setInvite] = useState(() => invitations.get(roomId));
  const [announcement, setAnnouncement] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<'rotate' | 'leave' | null>(null);
  const [retry, setRetry] = useState(false);
  const [nicknameDraft, setNicknameDraft] = useState<string | null>(null);
  const executing = useRef(false);
  const storedCommand = useRef<Command | null>(null);
  const inviteField = useRef<HTMLInputElement>(null);
  const room = state.view;

  useEffect(() => {
    if (state.error === 'SESSION_EXPIRED' || state.error === 'ROOM_CLOSED' || state.error === 'NOT_FOUND_OR_FORBIDDEN') {
      invitations.delete(roomId);
      void query.invalidateQueries({ queryKey: identityKey });
    }
  }, [query, roomId, state.error]);

  async function run(operation: string, repeat = false) {
    if (!room || executing.current || !state.live) return;
    const base = '/rooms/' + roomId;
    const saved = storedCommand.current;
    if (repeat && (!saved || (saved.retryAt ?? 0) > Date.now())) return;
    const command = repeat && saved ? saved : {
      operation, path: base + (operation === 'rotate' ? '/invitations/rotate' : '/' + operation),
      body: { commandId: crypto.randomUUID(), expectedRoomVersion: room.roomVersion },
    };
    executing.current = true;
    storedCommand.current = command;
    setError(null);
    setRetry(false);
    setPending(true);
    try {
      if (command.operation === 'start') {
        const created = await request<MatchMutation>(command.path, { method: 'POST', body: command.body });
        void navigate('/matches/' + created.matchId, { replace: true });
      } else {
        const result = await request<RoomMutation>(command.path, { method: 'POST', body: command.body });
        if (command.operation === 'rotate') {
          if (result.inviteUrl) invitations.set(roomId, result.inviteUrl);
          else invitations.delete(roomId);
          setInvite(result.inviteUrl);
          state.observe(result.roomView);
          if (!result.roomView) state.sync();
        } else {
          invitations.delete(roomId);
          void query.invalidateQueries({ queryKey: identityKey });
          void navigate('/', { replace: true });
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
    } finally { setPending(false); executing.current = false; setConfirm(null); }
  }

  if (!room || room.roomId !== roomId) {
    return <main className="shell narrow" id="main-content">
      <BackLink />
      {state.error ? <>
        <ErrorNotice code={state.error} />
        {state.error === 'SERVICE_UNAVAILABLE' && <button type="button" className="button secondary" onClick={state.retrySocket}>{t('common.retry')}</button>}
      </> : <Loading />}
    </main>;
  }
  if (room.currentMatchId) return <Navigate replace to={'/matches/' + room.currentMatchId} />;
  if (room.status === 'CLOSED' || room.status === 'EXPIRED') {
    return <main id="main-content" className="shell narrow"><BackLink /><ErrorNotice code="ROOM_CLOSED" /></main>;
  }
  const own = room.seats.find((seat) => seat.seatId === room.viewerSeatId);
  const guest = room.seats.find((seat) => !seat.isHost);
  const host = room.seats.find((seat) => seat.isHost);
  const isHost = room.hostSeatId === room.viewerSeatId;
  const ready = state.live && ['READY', 'REMATCH_READY'].includes(room.readiness);
  const hasRematch = room.readiness.startsWith('REMATCH');
  const eligible = isHost && ready && !pending && !retry;
  const status = !state.live ? 'common.reconnect' : !guest ? 'room.waiting' : !ready ? (hasRematch ? 'result.waitingForPresence' : 'room.connecting') : isHost ? 'room.hostReady' : 'room.guestReady';
  const expiry = room.inviteExpiresAt ? new Date(room.inviteExpiresAt) : null;
  const showInvite = invite && (!expiry || expiry.getTime() > Date.now());
  return <main className="shell lobby" id="main-content">
    <div className="page-top"><BackLink /><RulesButton gameId={room.gameId} /></div>
    <div className="lobby-layout">
      <section className="room-panel">
        <p className="eyebrow"><LockKeyhole size={16} />{t('room.title')}</p>
        <h1>{t('game.' + room.gameId)}</h1>
        <p className="lobby-status" role="status">{t(status)}</p>
        <div className="seat-grid" aria-label={t('room.seats')}>
          <PlayerSeat seat={host} own={own?.seatId === host?.seatId} />
          <PlayerSeat seat={guest} own={!!guest && own?.seatId === guest.seatId} />
        </div>
        <SeriesScore room={room} />
        {state.error && <ErrorNotice code={state.error} />}
        {error && <ErrorNotice code={error} />}
        {retry && <button type="button" className="button secondary" disabled={!state.live || pending} onClick={() => void run('', true)}>{t('common.retry')}</button>}
        <div className="room-actions">
          {isHost && (!hasRematch || ready) && <button className="button primary" type="button" disabled={!eligible} onClick={() => void run('start')}>
            {t(pending && storedCommand.current?.operation === 'start' ? 'room.starting' : hasRematch ? 'result.start' : 'room.start')}
            <ArrowUpRight size={17} />
          </button>}
          {room.lastMatchId && <Link className="button secondary" to={'/matches/' + room.lastMatchId}>{t('room.result')}</Link>}
          <button className="quiet-button danger-text" disabled={!state.live || pending || retry} type="button" onClick={(event) => { event.currentTarget.focus(); setConfirm('leave'); }}>{t('room.leave')}</button>
        </div>
        {!room.lastMatchId && own && (nicknameDraft === null ?
          <button className="quiet-button" disabled={!state.live || pending || retry} type="button" onClick={() => setNicknameDraft(own.nickname)}>{t('room.nickname')}</button> :
          <form className="nickname-form" onSubmit={(event) => {
            event.preventDefault();
            if (!state.live || executing.current || !nicknameDraft.trim()) return;
            executing.current = true;
            setPending(true);
            setError(null);
            void request('/me', { method: 'PATCH', body: { nickname: nicknameDraft } }).then(() => {
              setNicknameDraft(null);
              void query.invalidateQueries({ queryKey: identityKey });
              state.sync();
            }).catch((cause: unknown) => setError(errorCode(cause)))
              .finally(() => { executing.current = false; setPending(false); });
          }}>
            <div className="field">
              <label htmlFor="room-nickname">{t('room.nickname')}</label>
              <input id="room-nickname" name="nickname" autoComplete="nickname" dir="auto" maxLength={256} value={nicknameDraft} onChange={(event) => setNicknameDraft(event.target.value)} />
            </div>
            <button className="button secondary" type="submit" disabled={pending || !nicknameDraft.trim()}>{t('room.saveNickname')}</button>
            <button className="quiet-button" type="button" disabled={pending} onClick={() => setNicknameDraft(null)}>{t('common.cancel')}</button>
          </form>)}
      </section>
      <aside className="lobby-aside">
        <GameArt gameId={room.gameId} />
        {isHost && !guest && <section className="invite-panel" aria-label={t('room.invite')}>
          <h2><Link2 size={19} />{t('room.invite')}</h2>
          <p className="muted">{t(showInvite ? 'room.inviteHelp' : 'room.inviteMissing')}</p>
          {showInvite && <>
            <input className="invite-input" type="text" ref={inviteField} readOnly dir="ltr" aria-label={t('room.invite')} value={invite} onFocus={(event) => event.currentTarget.select()} />
            {expiry && <small className="muted">{t('room.inviteExpires', { time: new Intl.DateTimeFormat(i18n.resolvedLanguage, { timeStyle: 'short' }).format(expiry) })}</small>}
            <div className="invite-actions">
              <button type="button" className="button secondary" onClick={() => void (async () => {
                try { await navigator.clipboard.writeText(invite); setAnnouncement('room.copied'); }
                catch { inviteField.current?.focus(); inviteField.current?.select(); setAnnouncement('room.copyFailed'); }
              })()}><Clipboard size={16} />{t('room.copy')}</button>
              {typeof navigator.share === 'function' && <button type="button" className="button secondary" onClick={() => void (async () => {
                try { await navigator.share({ url: invite }); setAnnouncement('room.shared'); }
                catch (cause) {
                  if (!(cause instanceof DOMException && cause.name === 'AbortError')) {
                    inviteField.current?.focus(); inviteField.current?.select(); setAnnouncement('room.copyFailed');
                  }
                }
              })()}><Share2 size={16} />{t('room.share')}</button>}
            </div>
          </>}
          <p className="muted" role="status">{announcement && t(announcement)}</p>
          <button type="button" className="quiet-button" disabled={!state.live || pending || retry} onClick={(event) => { event.currentTarget.focus(); setConfirm('rotate'); }}>{t('room.rotate')}</button>
        </section>}
      </aside>
    </div>
    {confirm && <Dialog title={t(confirm === 'leave' ? 'room.leavePrompt' : 'room.rotate')} onClose={() => setConfirm(null)}>
      <p>{t(confirm === 'rotate' ? 'room.rotatePrompt' : isHost ? 'room.closePrompt' : 'room.guestLeavePrompt')}</p>
      <div className="dialog-actions">
        <button className="button secondary" type="button" onClick={() => setConfirm(null)}>{t('common.cancel')}</button>
        <button className={confirm === 'leave' ? 'button danger' : 'button primary'} type="button" disabled={pending} onClick={() => void run(confirm)}>{t(confirm === 'rotate' ? 'room.rotate' : 'room.leave')}</button>
      </div>
    </Dialog>}
  </main>;
}
