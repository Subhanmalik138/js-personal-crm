'use strict';

const { test, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src/store');
const commands = require('../src/commands');

let db;

beforeEach(() => {
  db = store.emptyDb();
});

function seedContact(overrides = {}) {
  const c = {
    id: `c${db.contacts.length + 1}`,
    name: 'Aisha Khan',
    email: 'aisha@example.com',
    phone: '',
    company: 'Acme',
    role: '',
    notes: '',
    tags: [],
    createdAt: '2026-11-10T00:00:00.000Z',
    updatedAt: '2026-11-10T00:00:00.000Z',
    ...overrides,
  };
  db.contacts.push(c);
  return c;
}

test('add creates a contact and list sorts by name', () => {
  commands.add({ db, flags: { name: 'Zara', email: 'z@example.com' } });
  commands.add({ db, flags: { name: 'Bilal', email: 'b@example.com' } });
  const out = commands.list({ db, flags: {} }).output;
  assert.match(out, /Bilal[\s\S]*Zara/);
  assert.match(out, /2 contact\(s\)/);
});

test('list filters by tag and company', () => {
  seedContact({ name: 'A', tags: ['vip'], company: 'Acme' });
  seedContact({ name: 'B', tags: [], company: 'Globex' });
  assert.match(commands.list({ db, flags: { tag: 'vip' } }).output, /A/);
  assert.doesNotMatch(commands.list({ db, flags: { tag: 'vip' } }).output, /B/);
  assert.match(commands.list({ db, flags: { company: 'globex' } }).output, /B/);
});

test('findContact resolves by id, exact name, or unique substring', () => {
  const c = seedContact();
  assert.equal(commands.findContact(db, c.id).name, 'Aisha Khan');
  assert.equal(commands.findContact(db, 'aisha khan').name, 'Aisha Khan');
  assert.equal(commands.findContact(db, 'aisha').name, 'Aisha Khan');
  assert.throws(() => commands.findContact(db, 'nobody'), /no contact found/);
});

test('findContact throws on an ambiguous name', () => {
  seedContact({ name: 'Sara Ahmed' });
  seedContact({ name: 'Sara Iqbal' });
  assert.throws(() => commands.findContact(db, 'sara'), /ambiguous name/);
});

test('delete without --force refuses; with --force cascades', () => {
  const c = seedContact();
  db.interactions.push({ id: 'i1', contactId: c.id, type: 'call', date: '2026-11-09', summary: 'hi' });
  db.reminders.push({ id: 'r1', contactId: c.id, due: '2026-11-12', note: 'call', done: false });
  assert.throws(() => commands.delete({ db, args: [c.id], flags: {} }), /without --force/);
  const out = commands.delete({ db, args: [c.id], flags: { force: true } });
  assert.equal(out.changed, true);
  assert.deepEqual(db.contacts, []);
  assert.deepEqual(db.interactions, []);
  assert.deepEqual(db.reminders, []);
});

test('log, remind, due and done form a full follow-up flow', () => {
  const c = seedContact();
  commands.log({ db, args: [c.id], flags: { type: 'call', date: '2026-11-09', summary: 'Intro call' } });
  commands.remind({ db, args: [c.id], flags: { due: '2026-11-01', note: 'Send proposal' } });
  const dueOut = commands.due({ db, flags: {} }).output;
  assert.match(dueOut, /Overdue \(1\)/);
  assert.match(dueOut, /Send proposal/);
  const reminderId = db.reminders[0].id;
  commands.done({ db, args: [reminderId] });
  assert.match(commands.due({ db, flags: {} }).output, /Overdue \(0\)/);
  assert.match(commands.show({ db, args: [c.id] }).output, /Intro call/);
});

test('tag and untag add and remove tags', () => {
  const c = seedContact();
  commands.tag({ db, args: [c.id, 'VIP', 'client'] });
  assert.deepEqual(c.tags, ['vip', 'client']);
  commands.tag({ db, args: [c.id, 'vip'] }); // duplicate is a no-op
  assert.deepEqual(c.tags, ['vip', 'client']);
  commands.untag({ db, args: [c.id, 'client'] });
  assert.deepEqual(c.tags, ['vip']);
});

test('export and import round-trip; re-import skips duplicate emails', () => {
  seedContact({ tags: ['vip'] });
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-csv-')), 'out.csv');
  commands.export({ db, flags: { file } });
  assert.match(fs.readFileSync(file, 'utf8'), /Aisha Khan/);
  const db2 = store.emptyDb();
  const first = commands.import({ db: db2, args: [file] });
  assert.match(first.output, /imported 1/);
  const second = commands.import({ db: db2, args: [file] });
  assert.match(second.output, /imported 0 contact\(s\), skipped 1/);
  assert.equal(db2.contacts.length, 1);
  assert.deepEqual(db2.contacts[0].tags, ['vip']);
});

test('stats counts contacts, interactions and overdue reminders', () => {
  const c = seedContact();
  commands.log({ db, args: [c.id], flags: { type: 'email', summary: 'Sent deck' } });
  commands.remind({ db, args: [c.id], flags: { due: '2020-01-01', note: 'Old task' } });
  const out = commands.stats({ db }).output;
  assert.match(out, /Contacts:\s+1/);
  assert.match(out, /Interactions:\s+1/);
  assert.match(out, /Reminders open:\s+1 \(1 overdue\)/);
  assert.match(out, /Acme: 1/);
});

test('search matches across name, company, notes and tags', () => {
  seedContact({ name: 'Aisha', company: 'Acme', notes: 'met at conf', tags: ['speaker'] });
  assert.equal(commands.search({ db, args: ['acme'] }).output.includes('Aisha'), true);
  assert.equal(commands.search({ db, args: ['speaker'] }).output.includes('Aisha'), true);
  assert.match(commands.search({ db, args: ['zzz'] }).output, /no contacts match/);
});
