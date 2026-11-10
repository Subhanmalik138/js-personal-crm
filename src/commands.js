'use strict';

/**
 * Command implementations. Each command receives { db, args, flags, dataPath }
 * and returns { changed?: boolean, output?: string }.
 *
 * Commands are added in stages; this file starts with the shared helpers
 * (contact lookup, table rendering) used by every later command.
 */

const fs = require('node:fs');
const models = require('./models');
const csv = require('./csv');

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

// ---------------------------------------------------------------------------
// Interactions & reminders
// ---------------------------------------------------------------------------

function log({ db, args, flags }) {
  const contact = findContact(db, args[0]);
  const interaction = models.createInteraction({
    contactId: contact.id,
    type: flags.type,
    date: flags.date,
    summary: flags.summary,
  });
  db.interactions.push(interaction);
  return {
    changed: true,
    output: `logged [${interaction.type}] on ${interaction.date} for ${contact.name}\n`,
  };
}

function remind({ db, args, flags }) {
  const contact = findContact(db, args[0]);
  const reminder = models.createReminder({
    contactId: contact.id,
    due: flags.due,
    note: flags.note,
  });
  db.reminders.push(reminder);
  return {
    changed: true,
    output: `reminder ${reminder.id} for ${contact.name} due ${reminder.due}\n`,
  };
}

function due({ db, flags }) {
  const today = models.today();
  const open = db.reminders.filter((r) => !r.done);
  const overdue = open.filter((r) => models.isOverdue(r, today));
  const upcoming = open.filter((r) => !models.isOverdue(r, today));
  const sortByDue = (a, b) => a.due.localeCompare(b.due);
  overdue.sort(sortByDue);
  upcoming.sort(sortByDue);
  const nameOf = (id) => {
    const c = db.contacts.find((x) => x.id === id);
    return c ? c.name : '(deleted contact)';
  };
  const lines = [];
  lines.push(`Overdue (${overdue.length}):`);
  for (const r of overdue) lines.push(`  ${r.due}  ${nameOf(r.contactId)} — ${r.note}  (${r.id})`);
  if (overdue.length === 0) lines.push('  (none)');
  lines.push('', `Upcoming (${upcoming.length}):`);
  for (const r of upcoming) lines.push(`  ${r.due}  ${nameOf(r.contactId)} — ${r.note}  (${r.id})`);
  if (upcoming.length === 0) lines.push('  (none)');
  if (flags.all) {
    const done = db.reminders.filter((r) => r.done).sort(sortByDue);
    lines.push('', `Done (${done.length}):`);
    for (const r of done) lines.push(`  ${r.due}  ${nameOf(r.contactId)} — ${r.note}  (${r.id})`);
    if (done.length === 0) lines.push('  (none)');
  }
  return { output: lines.join('\n') + '\n' };
}

function done({ db, args }) {
  const id = args[0];
  if (!id) throw new Error('done needs a reminder id');
  const reminder = db.reminders.find((r) => r.id === id);
  if (!reminder) throw new Error(`no reminder found for: ${id}`);
  if (reminder.done) return { output: `reminder ${id} was already done\n` };
  reminder.done = true;
  return { changed: true, output: `reminder ${id} marked done\n` };
}

// ---------------------------------------------------------------------------
// Tags, import/export & reports
// ---------------------------------------------------------------------------

function tag({ db, args }) {
  const contact = findContact(db, args[0]);
  const tags = models.normalizeTags(args.slice(1));
  if (tags.length === 0) throw new Error('tag needs at least one tag');
  const before = contact.tags.length;
  contact.tags = models.normalizeTags([...contact.tags, ...tags]);
  contact.updatedAt = new Date().toISOString();
  const added = contact.tags.length - before;
  return { changed: true, output: `added ${added} tag(s) to ${contact.name}: ${contact.tags.join(', ')}\n` };
}

function untag({ db, args }) {
  const contact = findContact(db, args[0]);
  const tags = new Set(models.normalizeTags(args.slice(1)));
  if (tags.size === 0) throw new Error('untag needs at least one tag');
  const before = contact.tags.length;
  contact.tags = contact.tags.filter((t) => !tags.has(t));
  contact.updatedAt = new Date().toISOString();
  return { changed: true, output: `removed ${before - contact.tags.length} tag(s) from ${contact.name}\n` };
}

const EXPORT_HEADER = ['name', 'email', 'phone', 'company', 'role', 'notes', 'tags'];

function exportCsv({ db, flags }) {
  const rows = [EXPORT_HEADER];
  const sorted = [...db.contacts].sort((a, b) => a.name.localeCompare(b.name));
  for (const c of sorted) {
    rows.push([c.name, c.email, c.phone, c.company, c.role, c.notes, c.tags.join(';')]);
  }
  const text = csv.toCsv(rows);
  if (flags.file) {
    fs.writeFileSync(flags.file, text, 'utf8');
    return { output: `exported ${sorted.length} contact(s) to ${flags.file}\n` };
  }
  return { output: text };
}

function importCsv({ db, args }) {
  const file = args[0];
  if (!file) throw new Error('import needs a CSV file path');
  const text = fs.readFileSync(file, 'utf8');
  const rows = csv.parseCsv(text);
  if (rows.length === 0) throw new Error('CSV file is empty');
  const header = rows[0].map((h) => h.trim().toLowerCase());
  const idx = (name) => header.indexOf(name);
  if (idx('name') === -1) throw new Error('CSV must have a "name" column');
  let added = 0;
  let skipped = 0;
  for (const row of rows.slice(1)) {
    const get = (name) => (idx(name) === -1 ? '' : row[idx(name)] || '');
    const name = get('name').trim();
    if (!name) {
      skipped += 1;
      continue;
    }
    const email = get('email').trim();
    if (email && db.contacts.some((c) => c.email && c.email.toLowerCase() === email.toLowerCase())) {
      skipped += 1; // duplicate email — keep the existing contact
      continue;
    }
    db.contacts.push(
      models.createContact({
        name,
        email,
        phone: get('phone'),
        company: get('company'),
        role: get('role'),
        notes: get('notes'),
        tags: get('tags') ? get('tags').split(';') : [],
      }),
    );
    added += 1;
  }
  return { changed: true, output: `imported ${added} contact(s), skipped ${skipped}\n` };
}

function stats({ db }) {
  const today = models.today();
  const byCompany = new Map();
  for (const c of db.contacts) {
    const key = c.company || '(no company)';
    byCompany.set(key, (byCompany.get(key) || 0) + 1);
  }
  const interactionsByContact = new Map();
  for (const i of db.interactions) {
    interactionsByContact.set(i.contactId, (interactionsByContact.get(i.contactId) || 0) + 1);
  }
  const mostActive = [...interactionsByContact.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id, count]) => {
      const c = db.contacts.find((x) => x.id === id);
      return `  ${c ? c.name : '(deleted)'}: ${count}`;
    });
  const overdue = db.reminders.filter((r) => models.isOverdue(r, today)).length;
  const openReminders = db.reminders.filter((r) => !r.done).length;
  const tagCounts = new Map();
  for (const c of db.contacts) {
    for (const t of c.tags) tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
  }
  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `  ${t}: ${n}`);

  const lines = [
    `Contacts:            ${db.contacts.length}`,
    `Interactions:        ${db.interactions.length}`,
    `Reminders open:      ${openReminders} (${overdue} overdue)`,
    '',
    'By company:',
    ...[...byCompany.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([company, n]) => `  ${company}: ${n}`),
    '',
    'Most active contacts:',
    ...(mostActive.length ? mostActive : ['  (no interactions yet)']),
    '',
    'Top tags:',
    ...(topTags.length ? topTags : ['  (no tags yet)']),
  ];
  return { output: lines.join('\n') + '\n' };
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
  log,
  remind,
  due,
  done,
  tag,
  untag,
  export: exportCsv,
  import: importCsv,
  stats,
};
