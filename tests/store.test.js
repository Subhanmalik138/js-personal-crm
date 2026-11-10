'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const store = require('../src/store');

function tmpFile() {
  return path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'crm-store-')), 'crm.json');
}

test('load returns an empty db for a missing file', () => {
  const db = store.load(tmpFile());
  assert.deepEqual(db, { version: 1, contacts: [], interactions: [], reminders: [] });
});

test('save then load round-trips the database', () => {
  const file = tmpFile();
  const db = store.emptyDb();
  db.contacts.push({ id: '1', name: 'Aisha' });
  store.save(file, db);
  assert.deepEqual(store.load(file), db);
});

test('load throws on corrupt JSON and on a wrong shape', () => {
  const file = tmpFile();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, '{not json', 'utf8');
  assert.throws(() => store.load(file), /not valid JSON/);
  fs.writeFileSync(file, '{"contacts": "nope"}', 'utf8');
  assert.throws(() => store.load(file), /unexpected shape/);
});

test('save is atomic: no temp file is left behind', () => {
  const file = tmpFile();
  store.save(file, store.emptyDb());
  const leftovers = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('.tmp-'));
  assert.deepEqual(leftovers, []);
});
