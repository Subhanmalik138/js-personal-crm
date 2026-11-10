'use strict';

/**
 * Command implementations. Each command receives { db, args, flags, dataPath }
 * and returns { changed?: boolean, output?: string }.
 *
 * Commands are added in stages; this file starts with the shared helpers
 * (contact lookup, table rendering) used by every later command.
 */

const models = require('./models');

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

// ---------------------------------------------------------------------------
// Contacts
// ---------------------------------------------------------------------------

function add({ db, flags }) {
  const contact = models.createContact({
    name: flags.name,
    email: flags.email,
    phone: flags.phone,
    company: flags.company,
    role: flags.role,
    notes: flags.notes,
    tags: flags.tags,
  });
  db.contacts.push(contact);
  return { changed: true, output: `added ${contact.id}  ${contact.name}\n` };
}

function list({ db, flags }) {
  let contacts = [...db.contacts];
  if (flags.tag) {
    const tag = String(flags.tag).toLowerCase();
    contacts = contacts.filter((c) => c.tags.includes(tag));
  }
  if (flags.company) {
    const company = String(flags.company).toLowerCase();
    contacts = contacts.filter((c) => c.company.toLowerCase().includes(company));
  }
  if (flags.search) contacts = searchContacts(contacts, String(flags.search));
  contacts.sort((a, b) => a.name.localeCompare(b.name));
  if (contacts.length === 0) return { output: 'no contacts found\n' };
  const lines = contacts.map(formatContactLine);
  return { output: `${lines.join('\n')}\n${contacts.length} contact(s)\n` };
}

function show({ db, args }) {
  const contact = findContact(db, args[0]);
  const interactions = db.interactions
    .filter((i) => i.contactId === contact.id)
    .sort((a, b) => b.date.localeCompare(a.date));
  const reminders = db.reminders
    .filter((r) => r.contactId === contact.id)
    .sort((a, b) => a.due.localeCompare(b.due));
  const lines = [
    `${contact.name}  (${contact.id})`,
    `  Email:   ${contact.email || '-'}`,
    `  Phone:   ${contact.phone || '-'}`,
    `  Company: ${contact.company || '-'}${contact.role ? ` — ${contact.role}` : ''}`,
    `  Tags:    ${contact.tags.length ? contact.tags.join(', ') : '-'}`,
    `  Notes:   ${contact.notes || '-'}`,
    `  Added:   ${contact.createdAt.slice(0, 10)}`,
    '',
    `Interactions (${interactions.length}):`,
  ];
  for (const i of interactions) lines.push(`  ${i.date}  [${i.type}] ${i.summary}`);
  if (interactions.length === 0) lines.push('  (none yet)');
  lines.push('', `Reminders (${reminders.length}):`);
  for (const r of reminders) {
    const state = r.done ? 'done' : models.isOverdue(r) ? 'OVERDUE' : 'open';
    lines.push(`  ${r.due}  [${state}] ${r.note}  (${r.id})`);
  }
  if (reminders.length === 0) lines.push('  (none yet)');
  return { output: lines.join('\n') + '\n' };
}

function edit({ db, args, flags }) {
  const contact = findContact(db, args[0]);
  const patch = {};
  for (const key of ['name', 'email', 'phone', 'company', 'role', 'notes', 'tags']) {
    if (flags[key] !== undefined) patch[key] = flags[key];
  }
  if (Object.keys(patch).length === 0) {
    throw new Error('nothing to update — pass at least one of --name, --email, --phone, --company, --role, --notes, --tags');
  }
  const updated = models.updateContact(contact, patch);
  Object.assign(contact, updated);
  return { changed: true, output: `updated ${contact.id}  ${contact.name}\n` };
}

function remove({ db, args, flags }) {
  const contact = findContact(db, args[0]);
  if (!flags.force) {
    throw new Error(
      `refusing to delete ${contact.name} without --force (this also removes their interactions and reminders)`,
    );
  }
  db.contacts = db.contacts.filter((c) => c.id !== contact.id);
  db.interactions = db.interactions.filter((i) => i.contactId !== contact.id);
  db.reminders = db.reminders.filter((r) => r.contactId !== contact.id);
  return { changed: true, output: `deleted ${contact.name}\n` };
}

function searchContacts(contacts, query) {
  const q = query.toLowerCase();
  return contacts.filter((c) =>
    [c.name, c.email, c.phone, c.company, c.role, c.notes, c.tags.join(' ')]
      .join(' ')
      .toLowerCase()
      .includes(q),
  );
}

function search({ db, args }) {
  const query = args.join(' ').trim();
  if (!query) throw new Error('search needs a query');
  const matches = searchContacts(db.contacts, query).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  if (matches.length === 0) return { output: `no contacts match "${query}"\n` };
  return {
    output: `${matches.map(formatContactLine).join('\n')}\n${matches.length} match(es)\n`,
  };
}

module.exports = {
  findContact,
  pad,
  formatContactLine,
  add,
  list,
  show,
  edit,
  delete: remove,
  search,
};
