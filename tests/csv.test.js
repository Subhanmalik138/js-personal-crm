'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const csv = require('../src/csv');

test('toCsv quotes fields containing commas, quotes or newlines', () => {
  const out = csv.toCsv([
    ['name', 'notes'],
    ['Aisha', 'met at "Acme", Inc.'],
    ['Bilal', 'line1\nline2'],
  ]);
  assert.match(out, /"met at ""Acme"", Inc\."/);
  assert.match(out, /"line1\nline2"/);
});

test('parseCsv round-trips quoted fields and CRLF endings', () => {
  const text = 'name,email,notes\r\n"Aisha, A",a@example.com,"hello ""world"""\r\nBilal,b@example.com,plain\r\n';
  const rows = csv.parseCsv(text);
  assert.deepEqual(rows, [
    ['name', 'email', 'notes'],
    ['Aisha, A', 'a@example.com', 'hello "world"'],
    ['Bilal', 'b@example.com', 'plain'],
  ]);
  assert.deepEqual(csv.parseCsv(csv.toCsv(rows)), rows);
});

test('parseCsv throws on an unterminated quoted field', () => {
  assert.throws(() => csv.parseCsv('a,"unterminated\n'), /unterminated quoted field/);
});
