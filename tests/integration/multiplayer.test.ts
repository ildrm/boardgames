import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { Client, emit, primary, secondary, setupRoom, success, waitForView, type Lobby, type Match } from './client.js';

const games = [
  { id: 'tic-tac-toe', win: [0, 3, 1, 4, 2], draw: [0, 1, 2, 4, 3, 5, 7, 6, 8] },
  { id: 'four-in-a-row', win: [0, 0, 1, 1, 2, 2, 3], draw: [3, 1, 6, 5, 4, 5, 5, 4, 4, 3, 4, 2, 3, 1, 1, 1, 2, 2, 1, 3, 6, 1, 5, 3, 0, 6, 6, 0, 4, 3, 6, 0, 6, 4, 2, 0, 0, 5, 2, 5, 2, 0] },
] as const;

for (const game of games) {
  test(game.id + ' · private room, cross-replica actions, recovery, win and rematch draw', { timeout: 90000 }, async (t) => {
    const host = new Client(primary);
    const guest = new Client(secondary);
    const outsider = new Client(secondary);
    const { roomId, token } = await setupRoom(game.id, host, guest);
    success(await outsider.http('/invites/preview', { token }));
    success(await outsider.http('/invites/preview', { token }));
    await outsider.guest('Other');
    assert.deepEqual(await outsider.http('/rooms/' + roomId), { ok: false, code: 'NOT_FOUND_OR_FORBIDDEN', retryable: false });
    const hs = await host.socket();
    const gs = await guest.socket();
    t.after(() => { gs.disconnect(); hs.disconnect(); });

    const waiting = success(await emit<Lobby>(hs, 'room:subscribe', { roomId })).data;
    assert.equal(waiting.readiness, 'WAITING');

    const joined = success(await guest.http<{ roomId: string }>('/rooms/join', { token, commandId: randomUUID() })).data;
    assert.equal(joined.roomId, roomId);
    assert.equal((await outsider.http('/invites/preview', { token })).ok, false);
    assert.equal(success(await guest.http<{ roomId: string }>('/rooms/join', { token, commandId: randomUUID() })).data.roomId, roomId);

    const beforePresence = success(await host.http<Lobby>('/rooms/' + roomId)).data;
    const blocked = await emit(hs, 'match:start', { roomId, commandId: randomUUID(), expectedRoomVersion: beforePresence.roomVersion });
    assert.ok(!blocked.ok && blocked.code === 'ROOM_NOT_READY');
    const hostReady = waitForView(hs, 'room:updated', (x) => (x as { roomView: Lobby }).roomView, (view) => view.readiness === 'READY');
    const ready = success(await emit<Lobby>(gs, 'room:subscribe', { roomId })).data;
    assert.equal(ready.readiness, 'READY');
    const observedReady = await hostReady;
    assert.equal(observedReady.roomVersion, ready.roomVersion);
    const start = { roomId, commandId: randomUUID(), expectedRoomVersion: ready.roomVersion };
    const denied = await emit(gs, 'match:start', start);
    assert.ok(!denied.ok && denied.code === 'NOT_HOST');
    const began = success(await emit<{ matchId: string }>(hs, 'match:start', start)).data;
    assert.equal(success(await emit<typeof began>(hs, 'match:start', start)).data.matchId, began.matchId);
    const open = success(await emit<Match>(hs, 'match:subscribe', { matchId: began.matchId })).data;
    const guestStart = success(await emit<Match>(gs, 'match:subscribe', { matchId: began.matchId })).data;
    assert.equal(open.stateVersion, '1');
    assert.equal(guestStart.matchId, open.matchId);
    assert.ok(open.board.flat().every((cell) => cell === null));

    const move = (index: number) => game.id === 'tic-tac-toe'
      ? { type: 'PLACE_MARK', payload: { row: Math.floor(index / 3), col: index % 3 } }
      : { type: 'DROP_DISC', payload: { col: index } };
    const socketFor = (view: Match, guestSocket = gs) => view.turnSeatId === open.viewerSeatId
      ? { sender: hs, receiver: guestSocket, http: host }
      : { sender: guestSocket, receiver: hs, http: guest };
    async function place(current: Match, index: number, guestSocket = gs, dual = false) {
      const { sender, receiver, http } = socketFor(current, guestSocket);
      const payload = { matchId: current.matchId, commandId: randomUUID(), expectedVersion: current.stateVersion, action: move(index) };
      const opponentView = waitForView(receiver, 'match:updated', (x) => (x as { playerView: Match }).playerView,
        (view) => view.matchId === current.matchId && view.moveCount === current.moveCount + 1);
      const socketReply = emit<{ playerView: Match }>(sender, 'game:action', payload);
      const replies = dual
        ? await Promise.all([socketReply, http.http<{ playerView: Match }>('/matches/' + current.matchId + '/actions', { commandId: payload.commandId, expectedVersion: payload.expectedVersion, action: payload.action }, 'POST', secondary)])
        : [await socketReply];
      const result = success(replies[0]).data.playerView;
      for (const reply of replies) assert.equal(success(reply).data.playerView.moveCount, current.moveCount + 1);
      assert.deepEqual((await opponentView).board, result.board);
      assert.equal(BigInt(result.stateVersion), BigInt(current.stateVersion) + 1n);
      return result;
    }

    const paused = waitForView(hs, 'match:updated', (x) => (x as { playerView: Match }).playerView, (view) => view.status === 'PAUSED');
    gs.disconnect();
    const pauseView = await paused;
    assert.deepEqual(pauseView.board, open.board);
    const recoveredGuest = await guest.socket(primary);
    t.after(() => recoveredGuest.disconnect());
    const resumed = success(await emit<Match>(recoveredGuest, 'match:subscribe', { matchId: began.matchId })).data;
    assert.equal(resumed.status, 'ACTIVE');
    assert.equal(resumed.turnSeatId, open.turnSeatId);
    let view = resumed;
    for (const [index, cell] of game.win.entries()) view = await place(view, cell, recoveredGuest, index === 0);
    assert.equal(view.status, 'FINISHED');
    assert.equal(view.result?.reason, 'LINE_COMPLETED');
    assert.deepEqual(view.result.winnerSeatIds, [open.turnSeatId]);
    assert.equal(view.result.winningLines.length, 1);

    async function consent(client: Client) {
      const current = success(await client.http<Lobby>('/rooms/' + roomId)).data;
      success(await client.http('/matches/' + began.matchId + '/rematch-consent', {
        commandId: randomUUID(), expectedRoomVersion: current.roomVersion, consent: true,
      }));
    }
    await consent(host);
    const oneConsent = success(await host.http<Lobby>('/rooms/' + roomId)).data;
    assert.equal(oneConsent.readiness, 'REMATCH_WAITING');
    await consent(guest);
    const both = success(await host.http<Lobby>('/rooms/' + roomId)).data;
    assert.equal(both.readiness, 'REMATCH_READY');
    const rematch = success(await emit<{ matchId: string }>(hs, 'match:start', {
      roomId, commandId: randomUUID(), expectedRoomVersion: both.roomVersion,
    })).data;
    assert.notEqual(rematch.matchId, began.matchId);
    view = success(await emit<Match>(hs, 'match:subscribe', { matchId: rematch.matchId })).data;
    assert.notEqual(view.turnSeatId, open.turnSeatId);
    success(await emit<Match>(recoveredGuest, 'match:subscribe', { matchId: rematch.matchId }));
    for (const cell of game.draw) {
      if (game.draw.length > 10) await delay(330);
      view = await place(view, cell, recoveredGuest);
    }
    assert.equal(view.result?.kind, 'DRAW');
    assert.deepEqual(view.result.winnerSeatIds, []);
    assert.equal(success(await host.http<Match>('/matches/' + began.matchId)).data.result?.kind, 'WIN');
  });
}

test('ROM-08 · one guest redeems the last seat across two replicas', { timeout: 15_000 }, async () => {
  for (const game of games) {
    const host = new Client(primary);
    const first = new Client(primary);
    const second = new Client(secondary);
    const { roomId, token } = await setupRoom(game.id, host, first);
    await second.guest('Second guest');
    const replies = await Promise.all([first, second].map((client) =>
      client.http<{ roomId: string }>('/rooms/join', { token, commandId: randomUUID() })));
    assert.equal(replies.filter((reply) => reply.ok).length, 1);
    const denial = replies.find((reply) => !reply.ok);
    assert.equal(denial?.code, 'INVITATION_UNAVAILABLE');
    const snapshot = success(await host.http<Lobby>('/rooms/' + roomId)).data;
    assert.equal(snapshot.seats.length, 2);
    assert.equal(snapshot.readiness, 'WAITING');
  }
});
