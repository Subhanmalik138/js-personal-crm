'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const models = require('../src/models');

test('createContact requires a name and validates email', () => {
  assert.throws(() => models.createContact({}), /name is required/);
  assert.throws(
    () => models.createContact({ name: 'A', email: 'not-an-email' }),
    /invalid email/,
  );
  const c = models.createContact({
    name: '  Aisha Khan ',
    email: 'aisha@example.com',
    tags: 'VIP, friend, vip',
  });
  assert.equal(c.name, 'Aisha Khan');
  assert.deepEqual(c.tags, ['vip', 'friend']); // trimmed, lowercased, deduped
  assert.equal(c.email, 'aisha@example.com');
  assert.ok(c.id);
  assert.ok(c.createdAt);
});

test('updateContact only changes whitelisted fields and re-validates', () => {
  const c = models.createContact({ name: 'Bilal', email: 'b@example.com' });
  const updated = models.updateContact(c, { role: 'CTO' });
  assert.equal(updated.role, 'CTO');
  assert.equal(updated.email, 'b@example.com'); // untouched fields survive
  assert.throws(() => models.updateContact(c, { email: 'bad' }), /invalid email/);
  assert.throws(() => models.updateContact(c, { name: '  ' }), /name is required/);
});

test('createInteraction validates type, date and summary', () => {
  assert.throws(
    () => models.createInteraction({ contactId: 'x', type: 'smoke', summary: 's' }),
    /invalid interaction type/,
  );
  assert.throws(
    () => models.createInteraction({ contactId: 'x', type: 'call', date: '2026-02-30', summary: 's' }),
    /invalid date/,
  );
  assert.throws(
    () => models.createInteraction({ contactId: 'x', type: 'call', summary: ' ' }),
    /summary is required/,
  );
  const i = models.createInteraction({
    contactId: 'x',
    type: 'CALL',
    date: '2026-11-09',
    summary: 'Discussed renewal',
  });
  assert.equal(i.type, 'call'); // normalized to lowercase
  assert.equal(i.date, '2026-11-09');
});

test('createReminder validates due date and note; isOverdue respects done flag', () => {
  assert.throws(
    () => models.createReminder({ contactId: 'x', due: 'tomorrow', note: 'n' }),
    /invalid due date/,
  );
  const r = models.createReminder({ contactId: 'x', due: '2026-11-01', note: 'Call back' });
  assert.equal(models.isOverdue(r, '2026-11-10'), true);
  assert.equal(models.isOverdue(r, '2026-10-31'), false);
  assert.equal(models.isOverdue({ ...r, done: true }, '2026-11-10'), false);
});

test('isValidDate rejects impossible calendar dates', () => {
  assert.equal(models.isValidDate('2026-02-29'), false); // 2026 is not a leap year
  assert.equal(models.isValidDate('2024-02-29'), true);
  assert.equal(models.isValidDate('2026-13-01'), false);
  assert.equal(models.isValidDate('2026-11-10'), true);
  assert.equal(models.isValidDate('10-11-2026'), false);
});

test('normalizeTags lowercases, trims and dedupes', () => {
  assert.deepEqual(models.normalizeTags([' VIP ', 'vip', 'Friend']), ['vip', 'friend']);
  assert.deepEqual(models.normalizeTags('a, b, a'), ['a', 'b']);
  assert.deepEqual(models.normalizeTags(undefined), []);
});
