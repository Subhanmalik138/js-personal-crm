'use strict';

/**
 * Atomic JSON store.
 *
 * The whole CRM lives in one JSON document:
 *   { version: 1, contacts: [], interactions: [], reminders: [] }
 *
 * Writes are atomic: the new document is written to a temp file in the same
 * directory and then renamed over the old one, so a crash mid-write can never
 * leave a half-written database behind.
 *
 * Default location is ~/.contactcli/crm.json. Override it with the
 * CONTACTCLI_DATA environment variable or the --data flag (useful for tests).
 */

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

function defaultDataPath() {
  if (process.env.CONTACTCLI_DATA) return process.env.CONTACTCLI_DATA;
  return path.join(os.homedir(), '.contactcli', 'crm.json');
}

function emptyDb() {
  return { version: 1, contacts: [], interactions: [], reminders: [] };
}

function isValidDb(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray(value.contacts) &&
    Array.isArray(value.interactions) &&
    Array.isArray(value.reminders)
  );
}

/**
 * Load the database from `dataPath`. A missing file yields an empty database;
 * a corrupt file throws with a message that names the file.
 */
function load(dataPath) {
  const file = dataPath || defaultDataPath();
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return emptyDb();
    throw new Error(`cannot read database at ${file}: ${err.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`database at ${file} is not valid JSON: ${err.message}`);
  }
  if (!isValidDb(parsed)) {
    throw new Error(`database at ${file} has an unexpected shape`);
  }
  return parsed;
}

/**
 * Save the database atomically: write to a temp file in the same directory,
 * fsync it, then rename over the target.
 */
function save(dataPath, db) {
  const file = dataPath || defaultDataPath();
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(file)}.tmp-${process.pid}`);
  const fd = fs.openSync(tmp, 'w');
  try {
    fs.writeFileSync(fd, JSON.stringify(db, null, 2) + '\n', 'utf8');
    fs.fsyncSync(fd);
  } finally {
    fs.closeSync(fd);
  }
  fs.renameSync(tmp, file);
}

module.exports = { defaultDataPath, emptyDb, isValidDb, load, save };
