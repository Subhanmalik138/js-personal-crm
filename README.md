# ContactCLI — a personal CRM for the command line

A small, zero-dependency CRM that lives in your terminal. Keep track of the
people you know, remember what you last talked about, and never miss a
follow-up — no account, no server, no subscription. Your data is a single
JSON file on your own machine.

## Why this exists

Most CRMs are built for sales teams. This one is built for one person: a
freelancer who juggles clients, a job seeker tracking hiring managers, or
anyone who meets a lot of people and hates forgetting the details. Everything
is a command away, and the whole database is a file you can back up, grep,
or carry to another machine.

## Features

- **Contacts** — name, email, phone, company, role, notes, and tags, with
  full-text search across all of them.
- **Interaction history** — log calls, emails, meetings, and messages per
  contact, so `show` reads like a timeline.
- **Follow-up reminders** — due dates with an overdue/upcoming view, so
  nothing slips.
- **Tags** — group contacts (`vip`, `client`, `alumni`…) and filter by tag.
- **CSV import/export** — move contacts in and out of spreadsheets; re-import
  skips contacts whose email you already have.
- **Reports** — counts, contacts per company, most active contacts, top tags.

## Quick start

Requires Node.js 18 or newer. No dependencies to install.

```bash
# Add your first contact
node src/cli.js add --name "Aisha Khan" --email aisha@example.com \
  --company Acme --role CTO --tags client,vip

# Log the conversation you just had
node src/cli.js log "Aisha Khan" --type call --summary "Discussed Q4 renewal"

# Remind yourself to follow up
node src/cli.js remind "Aisha Khan" --due 2026-11-15 --note "Send renewal proposal"

# See everything about her, and everything due
node src/cli.js show "Aisha Khan"
node src/cli.js due
```

Or install it globally from the repo root:

```bash
npm link
contact add --name "Bilal Ahmed" --email bilal@example.com
```

Contacts can be addressed by id, exact name, or any unique part of their
name — `contact show sara` works when there is only one Sara.

## Commands

| Command | What it does |
| --- | --- |
| `add --name … [--email …] [--phone …] [--company …] [--role …] [--tags a,b] [--notes …]` | Add a contact |
| `list [--tag t] [--company c] [--search q]` | List contacts, optionally filtered |
| `show <id-or-name>` | Full detail: contact, interactions, reminders |
| `edit <id-or-name> [--name …] [--email …] …` | Update any field |
| `delete <id-or-name> --force` | Delete a contact and their history |
| `search <query>` | Full-text search across every field |
| `log <id> --summary … [--type call\|email\|meeting\|message\|other] [--date YYYY-MM-DD]` | Log an interaction |
| `remind <id> --due YYYY-MM-DD --note …` | Add a follow-up reminder |
| `due [--all]` | Overdue and upcoming reminders |
| `done <reminder-id>` | Mark a reminder done |
| `tag <id> <tag…>` / `untag <id> <tag…>` | Add or remove tags |
| `export [--file path]` | Export contacts as CSV (stdout if no file) |
| `import <file>` | Import contacts from CSV |
| `stats` | Counts, companies, activity, top tags |

Global options: `--data <path>` uses a different database file,
`--help` prints the command list, `--version` prints the version.

## Design decisions

- **One JSON file, written atomically.** The database is a single document
  (`~/.contactcli/crm.json` by default). Every save writes to a temp file in
  the same directory and renames it over the old one, so a crash can never
  leave a half-written database. No database server to run, nothing to
  migrate — and the file is human-readable.
- **Zero dependencies.** The CLI, the CSV parser, and the test suite all run
  on Node.js built-ins only. Nothing to install, nothing to audit, nothing
  that can break on an upstream release.
- **Validation at the model boundary.** Email format, real calendar dates,
  and interaction types are checked when records are created, not when they
  are rendered — bad data can never enter the store through any command.
- **IDs are short and unique, names are a convenience.** Contacts get a
  compact generated id, but every command also accepts a name or unique
  substring, because nobody remembers ids. Ambiguous names are rejected
  explicitly instead of guessing.

## Data & privacy

All data stays on your machine in `~/.contactcli/crm.json`. Set
`CONTACTCLI_DATA` or pass `--data <path>` to keep it somewhere else (for
example, a synced folder). The tool makes no network requests at all.

## Running tests

```bash
npm test
```

23 tests cover the models (validation, dates, tags), the store (round-trip,
corrupt input, atomic writes), the CSV parser, and the full command flows
(CRUD, reminders, tags, import/export, stats), using Node's built-in
`node:test` runner.

## Tech stack

- Node.js 18+ (CommonJS, built-ins only: `fs`, `path`, `os`)
- `node:test` + `node:assert` for tests
