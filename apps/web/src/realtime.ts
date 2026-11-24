import { useCallback, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { ApiError, request } from './api';
import type { MatchView, RoomView } from './api';

const connection = io({ autoConnect: false, transports: ['websocket'], reconnectionDelay: 700, reconnectionDelayMax: 8_000, randomizationFactor: 0.5, timeout: 6_000 });
const subscriptions = new Map<string, ReturnType<typeof setTimeout> | null>();
let disconnectTimer: ReturnType<typeof setTimeout> | undefined;

type Scope = 'room' | 'match';
type View = RoomView | MatchView;
type Ack<T> = { ok: true; data: T } | { ok: false; code: string };
type State<T> = { view: T | null; live: boolean; error: string | null; animate: boolean };

function viewId(view: View) { return 'matchId' in view ? view.matchId : view.roomId; }

function compare(left: string, right: string) {
  const stored = BigInt(left);
  const candidate = BigInt(right);
  return stored === candidate ? 0 : stored > candidate ? 1 : -1;
}

function isNewer(candidate: View, current: View) {
  if ('stateVersion' in candidate && 'stateVersion' in current) {
    return compare(candidate.stateVersion, current.stateVersion) > 0
      || (candidate.stateVersion === current.stateVersion && compare(candidate.roomVersion, current.roomVersion) >= 0
        && compare(candidate.presenceRevision, current.presenceRevision) >= 0
        && (candidate.roomVersion !== current.roomVersion || candidate.presenceRevision !== current.presenceRevision));
  }
  if ('presenceRevision' in candidate && 'presenceRevision' in current) {
    return compare(candidate.roomVersion, current.roomVersion) >= 0
      && compare(candidate.presenceRevision, current.presenceRevision) >= 0
      && (candidate.roomVersion !== current.roomVersion || candidate.presenceRevision !== current.presenceRevision);
  }
  return false;
}

export function useRealtime<T extends View>(scope: Scope, id: string) {
  const [state, setState] = useState<State<T>>({ view: null, live: false, error: null, animate: false });
  const [refresh, setRefresh] = useState(0);
  const [retry, setRetry] = useState(0);
  const apply = useRef<(view: T) => void>(() => {});
  const sync = useCallback(() => setRefresh((value) => value + 1), []);
  const retrySocket = useCallback(() => setRetry((value) => value + 1), []);
  const observe = useCallback((view: T | undefined) => { if (view) apply.current(view); }, []);
  useEffect(() => {
    if (!id) return;
    const key = scope + ':' + id;
    const oldTimer = subscriptions.get(key);
    if (oldTimer) clearTimeout(oldTimer);
    subscriptions.set(key, null);
    if (disconnectTimer) clearTimeout(disconnectTimer);
    let disposed = false;
    let revoked = false;
    let epoch = 0;
    let syncing = true;
    let overflow = false;
    let queued: T[] = [];
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    const abort = new AbortController();
    setState((past) => ({ view: past.view && viewId(past.view) === id ? past.view : null, live: false, error: null, animate: false }));

    const accept = (view: T, source: 'snapshot' | 'event') => {
      if (disposed || revoked || viewId(view) !== id) return;
      setState((past) => {
        const current = past.view && viewId(past.view) === id ? past.view : null;
        if (current && current.viewerSeatId !== view.viewerSeatId) return past;
        if (current && !isNewer(view, current)) return past;
        const animate = source === 'event' && current !== null
          && 'stateVersion' in current && 'stateVersion' in view && view.moveCount === current.moveCount + 1
          && BigInt(view.stateVersion) === BigInt(current.stateVersion) + 1n;
        return { ...past, view, error: null, animate };
      });
    };
    apply.current = (view) => accept(view, 'event');

    const expire = () => {
      if (disposed) return;
      revoked = true;
      syncing = false;
      epoch++;
      setState({ view: null, live: false, error: 'SESSION_EXPIRED', animate: false });
    };
    const fail = (code: string) => {
      if (code === 'SESSION_EXPIRED' || code === 'UNAUTHENTICATED') {
        expire();
        return;
      }
      if (!disposed && !revoked) {
        setState((past) => ({ ...past, view: code === 'NOT_FOUND_OR_FORBIDDEN' ? null : past.view, live: false, error: code, animate: false }));
      }
    };

    const subscribe = () => {
      if (disposed || revoked) return;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      reconnectTimer = undefined;
      const attempt = ++epoch;
      syncing = true;
      queued = [];
      overflow = false;
      setState((past) => ({ ...past, live: false, animate: false }));
      const payload = scope === 'room' ? { roomId: id } : { matchId: id };
      connection.timeout(6_000).emit(scope + ':subscribe', payload, (error: Error | null, ack?: Ack<T>) => {
        if (disposed || revoked || epoch !== attempt) return;
        if (error || !ack) {
          fail('SERVICE_UNAVAILABLE');
          if (connection.connected) reconnectTimer = setTimeout(subscribe, 3_000);
          return;
        }
        if (!ack.ok) {
          fail(ack.code);
          if (ack.code === 'SERVICE_UNAVAILABLE') reconnectTimer = setTimeout(subscribe, 3_000);
          return;
        }
        accept(ack.data, 'snapshot');
        if (overflow) {
          subscribe();
          return;
        }
        for (const item of queued) accept(item, 'snapshot');
        queued = [];
        syncing = false;
        setState((past) => ({ ...past, live: true, error: null }));
      });
    };

    const disconnected = (reason: string) => {
      if (revoked || disposed) return;
      epoch++;
      syncing = true;
      setState((past) => ({ ...past, live: false, animate: false }));
      if (reason === 'io server disconnect') expire();
    };
    const event = (message: { roomView?: T; playerView?: T }) => {
      const candidate = scope === 'room' ? message.roomView : message.playerView;
      if (!candidate || viewId(candidate) !== id || revoked) return;
      if (syncing) {
        if (queued.length < 32) queued.push(candidate);
        else overflow = true;
      } else {
        accept(candidate, 'event');
      }
    };
    const degraded = (message: { retryAfterMs?: number }) => {
      if (disposed || revoked) return;
      syncing = true;
      epoch++;
      fail('SERVICE_UNAVAILABLE');
      if (!reconnectTimer) {
        reconnectTimer = setTimeout(subscribe, Math.max(1_000, Math.min(message.retryAfterMs ?? 3_000, 10_000)));
      }
    };
    const roomClosed = (message: { roomId: string }) => {
      if (scope === 'room' && message.roomId === id) {
        revoked = true;
        epoch++;
        setState({ view: null, live: false, error: 'ROOM_CLOSED', animate: false });
      }
    };
    const rejected = (error: Error & { data?: { code?: string } }) => {
      if (error.data?.code === 'SESSION_EXPIRED' || error.data?.code === 'UNAUTHENTICATED') expire();
      else fail('SERVICE_UNAVAILABLE');
    };

    connection.on('connect', subscribe).on('disconnect', disconnected).on('connect_error', rejected);
    connection.on(scope + ':updated', event).on('session:revoked', expire).on('room:closed', roomClosed).on('system:degraded', degraded);
    if (connection.connected) subscribe();
    else connection.connect();

    const readTimer = setTimeout(() => abort.abort(), 8_000);
    void request<T>((scope === 'room' ? '/rooms/' : '/matches/') + encodeURIComponent(id), { signal: abort.signal })
      .then((view) => accept(view, 'snapshot'))
      .catch((error: unknown) => {
        if (disposed || !syncing || revoked) return;
        fail(error instanceof ApiError ? error.code : 'SERVICE_UNAVAILABLE');
      }).finally(() => { clearTimeout(readTimer); });

    return () => {
      disposed = true;
      abort.abort();
      clearTimeout(readTimer);
      if (reconnectTimer) clearTimeout(reconnectTimer);
      connection.off('connect', subscribe).off('disconnect', disconnected).off('connect_error', rejected);
      connection.off(scope + ':updated', event).off('session:revoked', expire).off('room:closed', roomClosed).off('system:degraded', degraded);
      subscriptions.set(key, setTimeout(() => {
        if (connection.connected) connection.emit(scope + ':unsubscribe', scope === 'room' ? { roomId: id } : { matchId: id });
        subscriptions.delete(key);
        if (!subscriptions.size) {
          disconnectTimer = setTimeout(() => { if (!subscriptions.size) connection.disconnect(); }, 1_200);
        }
      }, 1_200));
    };
  }, [id, refresh, retry, scope]);
  return { ...state, sync, observe, retrySocket };
}
