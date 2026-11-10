'use strict';

/**
 * Domain model: contacts, interactions and reminders.
 *
 * Every factory validates its input and returns a plain object ready to be
 * stored. Validation errors throw Error with a human-readable message so the
 * CLI can print them directly.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const INTERACTION_TYPES = ['call', 'email', 'meeting', 'message', 'other'];

function newId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function isValidEmail(value) {
  return EMAIL_RE.test(value);
}

/** True when `value` is a real calendar date in YYYY-MM-DD form. */
function isValidDate(value) {
  if (!DATE_RE.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return (
    dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d
  );
}

function normalizeTags(tags) {
  if (tags === undefined || tags === null) return [];
  const list = Array.isArray(tags) ? tags : String(tags).split(',');
  const seen = new Set();
  const out = [];
  for (const raw of list) {
    const tag = String(raw).trim().toLowerCase();
    if (tag && !seen.has(tag)) {
      seen.add(tag);
      out.push(tag);
    }
  }
  return out;
}

function createContact(input = {}) {
  const name = String(input.name || '').trim();
  if (!name) throw new Error('contact name is required');
  if (name.length > 120) throw new Error('contact name must be at most 120 characters');

  const email = input.email ? String(input.email).trim() : '';
  if (email && !isValidEmail(email)) throw new Error(`invalid email address: ${email}`);

  const phone = input.phone ? String(input.phone).trim() : '';
  const company = input.company ? String(input.company).trim() : '';
  const role = input.role ? String(input.role).trim() : '';
  const notes = input.notes ? String(input.notes).trim() : '';

  const now = new Date().toISOString();
  return {
    id: newId(),
    name,
    email,
    phone,
    company,
    role,
    notes,
    tags: normalizeTags(input.tags),
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Apply a partial update to a contact. Only whitelisted fields change, and
 * the same validation rules as creation apply. Returns the updated contact.
 */
function updateContact(contact, patch = {}) {
  const next = { ...contact };
  if (patch.name !== undefined) {
    const name = String(patch.name).trim();
    if (!name) throw new Error('contact name is required');
    next.name = name;
  }
  if (patch.email !== undefined) {
    const email = String(patch.email).trim();
    if (email && !isValidEmail(email)) throw new Error(`invalid email address: ${email}`);
    next.email = email;
  }
  if (patch.phone !== undefined) next.phone = String(patch.phone).trim();
  if (patch.company !== undefined) next.company = String(patch.company).trim();
  if (patch.role !== undefined) next.role = String(patch.role).trim();
  if (patch.notes !== undefined) next.notes = String(patch.notes).trim();
  if (patch.tags !== undefined) next.tags = normalizeTags(patch.tags);
  next.updatedAt = new Date().toISOString();
  return next;
}

function createInteraction(input = {}) {
  if (!input.contactId) throw new Error('interaction needs a contactId');
  const type = String(input.type || 'other').toLowerCase();
  if (!INTERACTION_TYPES.includes(type)) {
    throw new Error(`invalid interaction type: ${type} (expected one of ${INTERACTION_TYPES.join(', ')})`);
  }
  const date = input.date ? String(input.date) : today();
  if (!isValidDate(date)) throw new Error(`invalid date: ${date} (expected YYYY-MM-DD)`);
  const summary = String(input.summary || '').trim();
  if (!summary) throw new Error('interaction summary is required');
  return {
    id: newId(),
    contactId: input.contactId,
    type,
    date,
    summary,
    createdAt: new Date().toISOString(),
  };
}

function createReminder(input = {}) {
  if (!input.contactId) throw new Error('reminder needs a contactId');
  const due = String(input.due || '').trim();
  if (!isValidDate(due)) throw new Error(`invalid due date: ${due} (expected YYYY-MM-DD)`);
  const note = String(input.note || '').trim();
  if (!note) throw new Error('reminder note is required');
  return {
    id: newId(),
    contactId: input.contactId,
    due,
    note,
    done: false,
    createdAt: new Date().toISOString(),
  };
}

/** A reminder is overdue when its due date is before today and it is not done. */
function isOverdue(reminder, refDate) {
  const ref = refDate || today();
  return !reminder.done && reminder.due < ref;
}

module.exports = {
  INTERACTION_TYPES,
  newId,
  today,
  isValidEmail,
  isValidDate,
  normalizeTags,
  createContact,
  updateContact,
  createInteraction,
  createReminder,
  isOverdue,
};
