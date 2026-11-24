import { strict as assert } from 'node:assert';
import { randomUUID } from 'node:crypto';
import { test } from 'node:test';
import { AppError, Application } from './application.js';
import { MemoryStore } from './store.js';

const origin = 'http://localhost:5173';

async function fixture() {
  let now = 1_700_000_000_000;
  const app = new Application(new MemoryStore(() => now), 'fixture credential key');
  const player = async (name: string) => {
    const proof = await app.issueBootstrap();
    const issued = await app.guest(proof, randomUUID(), name);
    return app.authenticate(issued.credential);
  };
  const host = await player('Host');
  const guest = await player('Guest');
  const hostLink = { nodeId: 'fixture', connectionId: 'host' };
  const guestLink = { nodeId: 'fixture', connectionId: 'guest' };
  return { app, host, guest, player, hostLink, guestLink, advance: (ms: number) => { now += ms; } };
}

async function readyRoom(state: Awaited<ReturnType<typeof fixture>>, gameId = 'tic-tac-toe') {
  const { app, host, guest, hostLink, guestLink } = state;
  const created = await app.createRoom(host, gameId, undefined, randomUUID(), origin);
  const invite = new URLSearchParams(new URL(created.inviteUrl!).hash.slice(1)).get('token')!;
  await app.subscribeRoom(host, created.roomId, hostLink);
  await app.join(guest, invite, randomUUID());
  const view = await app.subscribeRoom(guest, created.roomId, guestLink);
  return { ...created, invite, view };
}

const code = (expected: string) => (error: unknown) => error instanceof AppError && error.code === expected;

test('same-browser proof replays one guest credential within its original window', async () => {
  const { app, advance } = await fixture();
  const proof = await app.issueBootstrap();
  const command = randomUUID();
  advance(250_000);
  const first = await app.guest(proof, command, 'Same');
  const retry = await app.guest(proof, command, 'Same');
  assert.equal(first.credential, retry.credential);
  assert.equal(first.principal.principalId, retry.principal.principalId);
  advance(50_000);
  await assert.rejects(app.guest(proof, command, 'Same'), code('COMMAND_EXPIRED'));
  await app.prune();
  await assert.rejects(app.guest(proof, command, 'Same'), code('COMMAND_EXPIRED'));
});

test('preview preserves invitation and only one contender wins the last seat', async () => {
  const { app, host, guest, player } = await fixture();
  const outsider = await player('Outsider');
  const command = randomUUID();
  const created = await app.createRoom(host, 'tic-tac-toe', undefined, command, origin);
  const retry = await app.createRoom(host, 'tic-tac-toe', undefined, command, origin);
  assert.equal(retry.roomId, created.roomId);
  assert.equal(retry.inviteUrl, undefined);
  const invite = new URLSearchParams(new URL(created.inviteUrl!).hash.slice(1)).get('token')!;
  assert.equal((await app.preview(invite)).gameId, 'tic-tac-toe');
  const contenders = await Promise.allSettled([app.join(guest, invite, randomUUID()), app.join(outsider, invite, randomUUID())]);
  assert.equal(contenders.filter((item) => item.status === 'fulfilled').length, 1);
  assert.equal(contenders.filter((item) => item.status === 'rejected' && code('INVITATION_UNAVAILABLE')(item.reason)).length, 1);
  assert.equal((await app.room(host, created.roomId)).seats.length, 2);
  await assert.rejects(app.preview(invite), code('INVITATION_UNAVAILABLE'));
});

test('natural four-in-a-row win and mutual rematch keep durable version and role semantics', async () => {
  const state = await fixture();
  const { app, host, guest } = state;
  const { roomId, view } = await readyRoom(state, 'four-in-a-row');
  await assert.rejects(app.start(guest, roomId, { commandId: randomUUID(), expectedRoomVersion: view.roomVersion }), code('NOT_HOST'));
  const started = await app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: view.roomVersion });
  const seatId = started.playerView.viewerSeatId;
  const hostOpens = started.playerView.turnSeatId === seatId;
  const actions = [0, 0, 1, 1, 2, 2, 3];
  let version = '1';
  for (let i = 0; i < actions.length; i++) {
    const owner = (i % 2 === 0) === hostOpens ? host : guest;
    const command = { expectedVersion: version, commandId: randomUUID(), action: { type: 'DROP_DISC', payload: { col: actions[i] } } };
    const confirmed = await app.action(owner, started.matchId, command, 'action');
    const duplicated = await app.action(owner, started.matchId, command, 'action');
    assert.equal(duplicated.aggregateVersion, confirmed.aggregateVersion);
    assert.equal(confirmed.playerView.moveCount, i + 1);
    version = confirmed.aggregateVersion;
  }
  const ended = await app.match(host, started.matchId);
  assert.equal(ended.stateVersion, '8');
  assert.equal(ended.result?.reason, 'LINE_COMPLETED');
  assert.deepEqual(ended.result?.winningLines, [[{ row: 5, col: 0 }, { row: 5, col: 1 }, { row: 5, col: 2 }, { row: 5, col: 3 }]]);
  let room = await app.room(host, roomId);
  await assert.rejects(app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: room.roomVersion }), code('REMATCH_NOT_READY'));
  await app.consent(host, started.matchId, { commandId: randomUUID(), expectedRoomVersion: room.roomVersion, consent: true });
  room = await app.room(guest, roomId);
  await app.consent(guest, started.matchId, { commandId: randomUUID(), expectedRoomVersion: room.roomVersion, consent: true });
  room = await app.room(host, roomId);
  const next = await app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: room.roomVersion });
  assert.notEqual(next.matchId, started.matchId);
  assert.notEqual(next.playerView.turnSeatId, started.playerView.turnSeatId);
  assert.equal((await app.match(guest, started.matchId)).result?.terminalVersion, '8');
});

test('only last tab loss pauses, on-time reconnect resumes, and equality forfeits', async () => {
  const state = await fixture();
  const { app, host, guest, advance, guestLink } = state;
  const { roomId, view } = await readyRoom(state);
  const { matchId } = await app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: view.roomVersion });
  const extraTab = { nodeId: 'fixture', connectionId: 'another' };
  await app.subscribeMatch(guest, matchId, extraTab);
  await app.disconnect(roomId, extraTab);
  assert.equal((await app.match(host, matchId)).status, 'ACTIVE');
  await app.disconnect(roomId, guestLink);
  assert.equal((await app.match(host, matchId)).status, 'PAUSED');
  advance(119_999);
  assert.equal((await app.subscribeMatch(guest, matchId, guestLink)).status, 'ACTIVE');
  await app.disconnect(roomId, guestLink);
  advance(120_000);
  const expired = await app.subscribeMatch(guest, matchId, guestLink);
  assert.equal(expired.status, 'FINISHED');
  assert.equal(expired.result?.reason, 'DISCONNECT_FORFEIT');
  assert.deepEqual(expired.result?.winnerSeatIds, [expired.hostSeatId]);
  assert.equal(expired.moveCount, 0);
  assert.deepEqual(expired.result?.winningLines, []);
});

test('active idle transition commits once even when the triggering move is rejected', async () => {
  const state = await fixture();
  const { app, host, guest, advance } = state;
  const { roomId, view } = await readyRoom(state);
  const { matchId, playerView } = await app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: view.roomVersion });
  advance(600_000);
  const owner = playerView.viewerSeatId === playerView.turnSeatId ? host : guest;
  await assert.rejects(app.action(owner, matchId, {
    commandId: randomUUID(), expectedVersion: '1', action: { type: 'PLACE_MARK', payload: { row: 0, col: 0 } }
  }, 'action'), code('MATCH_ENDED'));
  const ended = await app.match(host, matchId);
  assert.equal(ended.stateVersion, '2');
  assert.equal(ended.moveCount, 0);
  assert.equal(ended.result?.reason, 'IDLE_TIMEOUT');
});

test('a gap in verified node presence cannot turn a pending disconnect into a forfeit', async () => {
  const state = await fixture();
  const { app, host, guest, advance, guestLink } = state;
  state.hostLink.nodeId = 'api-host';
  await app.heartbeat('api-host');
  const { roomId, view } = await readyRoom(state);
  const { matchId } = await app.start(host, roomId, { commandId: randomUUID(), expectedRoomVersion: view.roomVersion });
  await app.disconnect(roomId, guestLink);
  advance(120_000);
  assert.equal(await app.heartbeat('api-host'), true);
  const afterGap = await app.match(host, matchId);
  assert.equal(afterGap.status, 'PAUSED');
  assert.equal(afterGap.result, null);
  const recoveredHost = { nodeId: 'api-host', connectionId: 'host-again' };
  await app.subscribeMatch(host, matchId, recoveredHost);
  assert.equal((await app.subscribeMatch(guest, matchId, guestLink)).status, 'ACTIVE');
});

test('an expired create receipt cannot create a room while the same session remains valid', async () => {
  const { app, host, advance } = await fixture();
  const command = randomUUID();
  const created = await app.createRoom(host, 'tic-tac-toe', undefined, command, origin);
  await app.leave(host, created.roomId, { commandId: randomUUID(), expectedRoomVersion: created.roomView.roomVersion });
  advance(86_400_000);
  await app.prune();
  await assert.rejects(app.createRoom(host, 'tic-tac-toe', undefined, command, origin), code('COMMAND_EXPIRED'));
  assert.equal((await app.profile(host)).activeRoomId, null);
});
