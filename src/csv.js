'use strict';

/**
 * Minimal RFC 4180 CSV support: quoted fields, embedded commas, doubled
 * quotes, and CRLF line endings. No dependencies.
 */

function escapeField(value) {
  const s = String(value ?? '');
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(rows) {
  return rows.map((row) => row.map(escapeField).join(',')).join('\r\n') + '\r\n';
}

/**
 * Parse CSV text into an array of rows (each an array of strings).
 * Handles quoted fields spanning lines and "" escapes.
 */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  let i = 0;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  while (i < text.length) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
        } else {
          inQuotes = false;
          i += 1;
        }
      } else {
        field += ch;
        i += 1;
      }
    } else if (ch === '"') {
      inQuotes = true;
      i += 1;
    } else if (ch === ',') {
      pushField();
      i += 1;
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
      i += 1;
    } else if (ch === '\n') {
      pushRow();
      i += 1;
    } else {
      field += ch;
      i += 1;
    }
  }
  if (inQuotes) throw new Error('malformed CSV: unterminated quoted field');
  if (field !== '' || row.length > 0) pushRow();
  return rows.filter((r) => !(r.length === 1 && r[0] === ''));
}

module.exports = { escapeField, toCsv, parseCsv };
