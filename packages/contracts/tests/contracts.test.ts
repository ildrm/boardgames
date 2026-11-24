import assert from 'node:assert/strict';
import test from 'node:test';
import {
  actionCommandSchema, compareVersions, matchResultSchema, nicknameSchema, versionSchema,
} from '../src/index.ts';

test('commands reject unknown fields, incorrect payloads and noncanonical versions', () => {
  const valid = {
    matchId: '12345678-1234-4123-8123-123456789abc',
    commandId: '12345678-1234-4123-8123-123456789abd',
    expectedVersion: '5',
    action: { type: 'DROP_DISC', payload: { col: 6 } },
  };
  assert.deepEqual(actionCommandSchema.parse(valid), valid);
  assert.throws(() => actionCommandSchema.parse({ ...valid, principal: 'other' }));
  assert.throws(() => actionCommandSchema.parse({ ...valid, action: { type: 'DROP_DISC', payload: { col: 0, row: 5 } } }));
  for (const invalid of ['05', '+5', '5.0', 5, '-1', '9223372036854775808']) {
    assert.equal(versionSchema.safeParse(invalid).success, false);
  }
  assert.equal(compareVersions('10', '9'), 1);
  assert.equal(compareVersions('9007199254740992', '9007199254740993'), -1);
  assert.equal(compareVersions('0', '0'), 0);
});

test('nickname accepts Persian joining and counts graphemes after NFC normalization', () => {
  assert.equal(nicknameSchema.parse('  هم‌بازی '), 'هم‌بازی');
  assert.equal(nicknameSchema.parse('a'), 'a');
  assert.equal(nicknameSchema.parse('e\u0301'.repeat(24)), 'é'.repeat(24));
  assert.equal(nicknameSchema.parse('<b>'), '<b>');
  assert.equal(new TextEncoder().encode(nicknameSchema.parse('a' + '\u0301'.repeat(128))).length, 256);
  for (const name of ['', 'a'.repeat(25), 'a\u202eb', 'a\u2066b', '\u200c', 'a\u0001b', 'a' + '\u0301'.repeat(129)]) {
    assert.equal(nicknameSchema.safeParse(name).success, false);
  }
});

test('platform final results pair reason, winners and geometry correctly', () => {
  const result = { kind: 'WIN', reason: 'DISCONNECT_FORFEIT', winnerSeatIds: ['reply'], winningLines: [], terminalVersion: '17' };
  assert.deepEqual(matchResultSchema.parse(result), result);
  assert.throws(() => matchResultSchema.parse({ ...result, winningLines: [[{ row: 0, col: 0 }]] }));
  assert.throws(() => matchResultSchema.parse({ ...result, kind: 'DRAW' }));
  assert.throws(() => matchResultSchema.parse({ ...result, winnerSeatIds: [] }));
  assert.throws(() => matchResultSchema.parse({ ...result, winnerSeatIds: ['open', 'reply'] }));
});
