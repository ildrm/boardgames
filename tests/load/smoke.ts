import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';
import type { Socket } from 'socket.io-client';
import { Client, emit, primary, secondary, setupRoom, success, waitForView, type Lobby, type Match } from '../integration/client.js';

for (const address of [primary, secondary]) {
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname), 'Run this smoke workload on loopback');
}
const count = Number(process.env.TABLEMATE_SMOKE_ROOMS ?? '4');
assert.ok(Number.isInteger(count) && count >= 1 && count <= 50, 'Select 1–50 simultaneous rooms');
const samples: number[] = [];
const rooms: { hs: Socket; gs: Socket; isGrid: boolean; match: Match }[] = [];
const sockets: Socket[] = [];
const startedAt = performance.now();
try {
  const admission = 14;
  for (let n = 0; n < count; n++) {
    const host = new Client(primary);
    const guest = new Client(secondary);
    // Keep session creation within the default per-origin admission window.
    if (n > 0 && n % admission === 0) {
      console.log('Admitted ' + n * 2 + ' sockets. Waiting for the next session window.');
      await delay(60_100);
    }
    const room = await setupRoom(n % 2 === 0 ? 'tic-tac-toe' : 'four-in-a-row', host, guest);
    const hs = await host.socket();
    sockets.push(hs);
    const gs = await guest.socket();
    sockets.push(gs);
    success(await emit<Lobby>(hs, 'room:subscribe', { roomId: room.roomId }));
    success(await guest.http('/rooms/join', { token: room.token, commandId: randomUUID() }));
    const ready = success(await emit<Lobby>(gs, 'room:subscribe', { roomId: room.roomId })).data;
    const match = success(await emit<{ matchId: string }>(hs, 'match:start', {
      roomId: room.roomId, commandId: randomUUID(), expectedRoomVersion: ready.roomVersion,
    })).data;
    const first = success(await emit<Match>(hs, 'match:subscribe', { matchId: match.matchId })).data;
    const second = success(await emit<Match>(gs, 'match:subscribe', { matchId: match.matchId })).data;
    assert.equal(second.turnSeatId, first.turnSeatId);
    const unsubscribed = await Promise.all([hs, gs].map((socket) => emit(socket, 'room:unsubscribe', { roomId: room.roomId })));
    for (const response of unsubscribed) success(response);
    rooms.push({ hs, gs, isGrid: n % 2 === 0, match: first });
  }
  console.log('Playing through ' + count + ' simultaneous rooms.');
  const cadenceMs = 5_000;
  const activeStart = performance.now();
  await Promise.all(rooms.map(async (room, offset) => {
    let match = room.match;
    const hostSeat = match.viewerSeatId;
    const moves = room.isGrid ? [0, 3, 1, 4, 2] : [0, 0, 1, 1, 2, 2, 3];
    for (const [ply, index] of moves.entries()) {
      const due = activeStart + offset * cadenceMs / rooms.length + ply * cadenceMs;
      await delay(Math.max(0, due - performance.now()));
      const hostTurn = match.turnSeatId === hostSeat;
      const sender = hostTurn ? room.hs : room.gs;
      const receiver = hostTurn ? room.gs : room.hs;
      const expectedMoveCount = match.moveCount + 1;
      const update = waitForView(receiver, 'match:updated', (x) => (x as { playerView: Match }).playerView,
        (other) => other.moveCount === expectedMoveCount);
      const intent = performance.now();
      const [reply, other] = await Promise.all([emit<{ playerView: Match }>(sender, 'game:action', {
        matchId: match.matchId, commandId: randomUUID(), expectedVersion: match.stateVersion,
        action: room.isGrid
          ? { type: 'PLACE_MARK', payload: { row: Math.floor(index / 3), col: index % 3 } }
          : { type: 'DROP_DISC', payload: { col: index } },
      }), update]).catch((error: unknown) => {
        const connectionState = sender.connected && receiver.connected ? 'both connected' : 'socket disconnected';
        throw new Error(`Room ${offset + 1}, ply ${ply + 1} (${connectionState})`, { cause: error });
      });
      match = success(reply).data.playerView;
      samples.push(performance.now() - intent);
      assert.equal(other.stateVersion, match.stateVersion);
      assert.deepEqual(other.board, match.board);
      assert.deepEqual(other.result, match.result);
    }
    assert.equal(match.result?.reason, 'LINE_COMPLETED');
  }));
  samples.sort((left, right) => left - right);
  const percentile = (p: number) => Math.round(samples[Math.ceil(samples.length * p) - 1]);
  console.log(JSON.stringify({
    sockets: count * 2, completedRooms: count, confirmedMoves: samples.length,
    roomMoveCadenceMs: cadenceMs, activePlayMs: Math.round(performance.now() - activeStart),
    actionToBothClientsMs: { p50: percentile(.5), p95: percentile(.95), p99: percentile(.99) },
    totalSetupAndPlayMs: Math.round(performance.now() - startedAt),
  }, null, 2));
} finally {
  for (const socket of sockets) socket.disconnect();
}
