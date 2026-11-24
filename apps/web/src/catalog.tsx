import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowUpRight, LockKeyhole, UsersRound } from 'lucide-react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ApiError, ensureGuest, request } from './api';
import type { Game, Identity, RoomMutation } from './api';
import { GameArt } from './art';
import { BackLink, ErrorNotice, Loading, RulesButton, errorCode } from './ui';

const newId = () => crypto.randomUUID();
export const invitations = new Map<string, string>();
export const identityKey = ['identity'] as const;
const gamesKey = ['games'] as const;

export function useIdentity() {
  return useQuery({
    queryKey: identityKey,
    queryFn: async () => {
      try { return await request<Identity>('/me'); }
      catch (error) {
        if (error instanceof ApiError && ['UNAUTHENTICATED', 'SESSION_EXPIRED'].includes(error.code)) return null;
        throw error;
      }
    },
    retry: false,
  });
}

function useGames() {
  return useQuery({
    queryKey: gamesKey,
    queryFn: () => request<Game[]>('/games'),
    retry: false,
    staleTime: 60_000,
  });
}

export function Catalog() {
  const { t } = useTranslation();
  const games = useGames();
  const identity = useIdentity();
  return <main id="main-content" className="catalog shell">
    <section className="catalog-intro">
      <div>
        <h1>{t('catalog.heading')}</h1>
        <p>{t('catalog.description')}</p>
      </div>
      <span className="private-note"><LockKeyhole size={16} />{t('catalog.private')}</span>
    </section>
    {identity.data?.activeRoomId && <Link className="button secondary return-active" to={'/rooms/' + identity.data.activeRoomId}>{t('room.return')}<ArrowUpRight size={16} /></Link>}
    <section aria-label={t('catalog.games')}>
      {games.isPending && <Loading />}
      {games.error && <div className="catalog-error"><ErrorNotice code={errorCode(games.error)} /><button className="button secondary" onClick={() => void games.refetch()}>{t('common.retry')}</button></div>}
      {games.data?.length === 0 && <p role="status">{t('catalog.empty')}</p>}
      <div className="games-grid">
        {games.data?.map((game) => <article className="game-card" key={game.id}>
          <GameArt gameId={game.id} />
          <div className="game-details">
            <div className="game-title-row"><h2>{t('game.' + game.id, { defaultValue: game.title })}</h2><span className="player-count"><UsersRound size={15} /> {t('catalog.players')}</span></div>
            <p>{t('game.description.' + game.id, { defaultValue: game.description })}</p>
            <Link to={'/games/' + game.id} className="button primary" aria-label={t('create.button') + ' · ' + t('game.' + game.id)}>
              <span>{t('create.button')}</span><ArrowUpRight size={17} />
            </Link>
          </div>
        </article>)}
      </div>
    </section>
  </main>;
}

function NicknameField({ value, set }: { value: string; set: (value: string) => void }) {
  const { t } = useTranslation();
  return <div className="field">
    <label htmlFor="nickname">{t('create.nickname')}</label>
    <input id="nickname" name="nickname" autoComplete="nickname" dir="auto" maxLength={256} aria-describedby="nickname-hint" value={value} onChange={(event) => set(event.target.value)} />
    <small id="nickname-hint">{t('create.nicknameHelp')}</small>
  </div>;
}

export function Create() {
  const { t } = useTranslation();
  const { gameId = '' } = useParams();
  const gameQuery = useGames();
  const game = gameQuery.data?.find((item) => item.id === gameId);
  const identity = useIdentity();
  const query = useQueryClient();
  const navigate = useNavigate();
  const [nickname, setNickname] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const command = useRef(newId());
  const executing = useRef(false);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!game || executing.current) return;
    executing.current = true;
    setError(null);
    setPending(true);
    try {
      await ensureGuest(nickname);
      const output = await request<RoomMutation>('/rooms', {
        method: 'POST', body: { gameId, rulesVersion: game.rulesVersion, commandId: command.current },
      });
      if (output.inviteUrl) invitations.set(output.roomId, output.inviteUrl);
      void query.invalidateQueries({ queryKey: identityKey });
      void navigate('/rooms/' + output.roomId, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && !cause.retryable) command.current = newId();
      setError(errorCode(cause));
      void query.invalidateQueries({ queryKey: identityKey });
    } finally { executing.current = false; setPending(false); }
  }

  return <main id="main-content" className="shell narrow">
    <BackLink />
    {gameQuery.isPending ? <Loading /> : !game ? <ErrorNotice code={gameQuery.error ? errorCode(gameQuery.error) : 'NOT_FOUND_OR_FORBIDDEN'} /> : <article className="form-panel">
      <GameArt gameId={game.id} compact />
      <div className="panel-content">
        <p className="eyebrow">{t('game.' + game.id)}</p>
        <h1>{t('create.heading')}</h1>
        <form onSubmit={(event) => void create(event)}>
          {!identity.data && !identity.isPending && <NicknameField value={nickname} set={setNickname} />}
          {error && <ErrorNotice code={error} />}
          {identity.data?.activeRoomId ? <Link className="button primary wide" to={'/rooms/' + identity.data.activeRoomId}>{t('room.return')}</Link> :
            <button type="submit" className="button primary wide" disabled={pending || identity.isPending}>{t(pending ? 'create.loading' : 'create.button')}</button>}
        </form>
        <RulesButton gameId={game.id} />
      </div>
    </article>}
  </main>;
}

type Preview = { gameId: string; title?: string; rulesVersion?: number };

export function Join() {
  const { t } = useTranslation();
  const identity = useIdentity();
  const query = useQueryClient();
  const navigate = useNavigate();
  const [token] = useState(() => new URLSearchParams(location.hash.slice(1)).get('token') ?? '');
  const [preview, setPreview] = useState<Preview | null>(null);
  const [checking, setChecking] = useState(!!token);
  const [previewError, setPreviewError] = useState<string | null>(token ? null : 'INVITATION_UNAVAILABLE');
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [pending, setPending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const command = useRef(newId());
  const executing = useRef(false);
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    setChecking(true);
    setPreviewError(null);
    void request<Preview>('/invites/preview', {
      method: 'POST', body: { token }, signal: controller.signal,
    }).then(setPreview).catch((cause: unknown) => {
      if (!controller.signal.reason?.silent) setPreviewError(errorCode(cause));
    }).finally(() => {
      clearTimeout(timeout);
      if (!controller.signal.aborted || !controller.signal.reason?.silent) setChecking(false);
    });
    return () => { clearTimeout(timeout); controller.abort({ silent: true }); };
  }, [token, attempt]);

  async function join(event: FormEvent) {
    event.preventDefault();
    if (executing.current || !token) return;
    executing.current = true;
    setPending(true);
    setError(null);
    try {
      await ensureGuest(nickname);
      const output = await request<RoomMutation>('/rooms/join', { method: 'POST', body: { token, commandId: command.current } });
      void query.invalidateQueries({ queryKey: identityKey });
      void navigate('/rooms/' + output.roomId, { replace: true });
    } catch (cause) {
      if (cause instanceof ApiError && !cause.retryable) command.current = newId();
      setError(errorCode(cause));
      void query.invalidateQueries({ queryKey: identityKey });
    } finally { executing.current = false; setPending(false); }
  }

  return <main id="main-content" className="shell narrow">
    <Link className="back-link" to="/" replace>{t('common.back')}</Link>
    <article className="form-panel">
      {preview && <GameArt gameId={preview.gameId} compact />}
      <div className="panel-content">
        {preview && <p className="eyebrow">{t('game.' + preview.gameId, { defaultValue: preview.title })}</p>}
        <h1>{t('join.heading')}</h1>
        {checking && <Loading />}
        {previewError && <ErrorNotice code={previewError} />}
        {previewError === 'SERVICE_UNAVAILABLE' && <button className="button secondary" onClick={() => setAttempt(attempt + 1)}>{t('common.retry')}</button>}
        {preview && <p className="muted">{t('join.description')}</p>}
        {error && <ErrorNotice code={error} />}
        {identity.data?.activeRoomId && (!preview || error === 'ACTIVE_ROOM_EXISTS') ?
          <Link className="button primary wide" to={'/rooms/' + identity.data.activeRoomId} replace>{t('room.return')}</Link> :
          preview && <form onSubmit={(event) => void join(event)}>
            {!identity.data && !identity.isPending && <NicknameField value={nickname} set={setNickname} />}
            <button type="submit" className="button primary wide" disabled={pending || identity.isPending}>{t(pending ? 'join.loading' : 'join.button')}</button>
          </form>}
      </div>
    </article>
  </main>;
}
