import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';
import { Client, emit, primary, secondary, setupRoom, success, type Lobby, type Match } from '../../../tests/integration/client.js';

const run = promisify(execFile);
const enabled = process.env.TABLEMATE_RESTART_FIXTURE === '1';

test('restart the secondary Compose API after a durable ACK and resume on another replica', { skip: !enabled, timeout: 60_000 }, async (t) => {
  for (const address of [primary, secondary]) {
    const url = new URL(address);
    assert.ok(['localhost', '127.0.0.1'].includes(url.hostname), 'fixture origins must use loopback');
    assert.equal((await fetch(address + '/health/ready', { signal: AbortSignal.timeout(3_000) })).status, 200);
  }
  const host = new Client(primary);
  const guest = new Client(secondary);
  const { roomId, token } = await setupRoom('tic-tac-toe', host, guest);
  const hostSocket = await host.socket();
  const guestSocket = await guest.socket();
  t.after(() => { guestSocket.disconnect(); hostSocket.disconnect(); });
  success(await emit<Lobby>(hostSocket, 'room:subscribe', { roomId }));
  success(await guest.http('/rooms/join', { token, commandId: randomUUID() }));
  const ready = success(await emit<Lobby>(guestSocket, 'room:subscribe', { roomId })).data;
  const { matchId } = success(await emit<{ matchId: string }>(hostSocket, 'match:start', {
    roomId, commandId: randomUUID(), expectedRoomVersion: ready.roomVersion
  })).data;
  const hostView = success(await emit<Match>(hostSocket, 'match:subscribe', { matchId })).data;
  success(await emit<Match>(guestSocket, 'match:subscribe', { matchId }));
  const hostOpens = hostView.turnSeatId === hostView.viewerSeatId;
  const command = {
    matchId, commandId: randomUUID(), expectedVersion: hostView.stateVersion,
    action: { type: 'PLACE_MARK', payload: { row: 0, col: 0 } }
  };
  const accepted = success(await emit<{ playerView: Match }>(hostOpens ? hostSocket : guestSocket, 'game:action', command)).data.playerView;
  assert.equal(accepted.moveCount, 1);
  assert.equal(accepted.stateVersion, '2');

  await run('rtk', ['proxy', 'docker', 'compose', '--profile', 'replicas', 'restart', 'api-secondary'], {
    cwd: new URL('../../../', import.meta.url), timeout: 30_000
  });
  let secondaryReady = false;
  for (let attempt = 0; attempt < 24; attempt++) {
    try {
      secondaryReady = (await fetch(secondary + '/health/ready', { signal: AbortSignal.timeout(1_000) })).ok;
      if (secondaryReady) break;
    } catch {
      // A restarted replica needs time to rejoin its dependencies.
    }
    await delay(500);
  }
  assert.ok(secondaryReady, 'the restarted replica must become ready');

  const recovered = await guest.socket(primary);
  t.after(() => recovered.disconnect());
  const snapshot = success(await emit<Match>(recovered, 'match:subscribe', { matchId })).data;
  assert.equal(snapshot.status, 'ACTIVE');
  assert.equal(snapshot.moveCount, 1);
  assert.deepEqual(snapshot.board, accepted.board);

  const retried = success(await emit<{ playerView: Match }>(hostOpens ? hostSocket : recovered, 'game:action', command));
  assert.equal(retried.aggregateVersion, '2');
  assert.equal(retried.data.playerView.moveCount, 1);
  const fromRestarted = success(await guest.http<Match>('/matches/' + matchId)).data;
  assert.equal(fromRestarted.moveCount, 1);
  assert.deepEqual(fromRestarted.board, accepted.board);
});
