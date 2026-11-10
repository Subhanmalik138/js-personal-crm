'use strict';

/**
 * Command implementations. Each command receives { db, args, flags, dataPath }
 * and returns { changed?: boolean, output?: string }.
 *
 * Commands are added in stages; this file starts with the shared helpers
 * (contact lookup, table rendering) used by every later command.
 */

function findContact(db, idOrName) {
  const needle = String(idOrName || '').trim().toLowerCase();
  if (!needle) throw new Error('a contact id or name is required');
  const byId = db.contacts.find((c) => c.id === idOrName);
  if (byId) return byId;
  const matches = db.contacts.filter(
    (c) => c.name.toLowerCase() === needle || c.name.toLowerCase().includes(needle),
  );
  if (matches.length === 1) return matches[0];
  if (matches.length > 1) {
    const ids = matches.map((c) => `  ${c.id}  ${c.name}`).join('\n');
    throw new Error(`ambiguous name — ${matches.length} contacts match:\n${ids}`);
  }
  throw new Error(`no contact found for: ${idOrName}`);
}

function pad(value, width) {
  const s = String(value ?? '');
  return s.length >= width ? s.slice(0, width) : s + ' '.repeat(width - s.length);
}

function formatContactLine(c) {
  const tags = c.tags.length ? ` [${c.tags.join(', ')}]` : '';
  const company = c.company ? ` — ${c.company}` : '';
  return `${pad(c.id, 12)} ${pad(c.name, 24)} ${pad(c.email, 28)}${company}${tags}`;
}

module.exports = {
  findContact,
  pad,
  formatContactLine,
};
