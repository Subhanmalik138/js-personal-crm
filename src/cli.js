#!/usr/bin/env node
'use strict';

/**
 * ContactCLI — a personal CRM for the command line.
 *
 * Zero dependencies, Node.js >= 18. Data lives in ~/.contactcli/crm.json
 * (override with --data <path> or CONTACTCLI_DATA).
 *
 * Commands are implemented in src/commands.js; this file only parses
 * arguments, resolves the data file, and dispatches.
 */

const store = require('./store');
const commands = require('./commands');

const VERSION = '1.0.0';

const HELP = `ContactCLI — a personal CRM for the command line

Usage: contact <command> [options]

Contacts:
  add --name <name> [--email <e>] [--phone <p>] [--company <c>]
      [--role <r>] [--tags <a,b>] [--notes <n>]   Add a contact
  list [--tag <t>] [--company <c>] [--search <q>] List contacts
  show <id>                                       Show a contact with history
  edit <id> [--name ...] [--email ...] ...         Update a contact
  delete <id> [--force]                           Delete a contact
  search <query>                                  Full-text search

Interactions & reminders:
  log <id> --summary <text> [--type call|email|meeting|message|other]
      [--date YYYY-MM-DD]                         Log an interaction
  remind <id> --due YYYY-MM-DD --note <text>      Add a follow-up reminder
  due [--all]                                     Overdue & upcoming reminders
  done <reminder-id>                              Mark a reminder done

Tags, import/export & reports:
  tag <id> <tag...>                               Add tags to a contact
  untag <id> <tag...>                             Remove tags from a contact
  export [--file <path>]                          Export contacts as CSV
  import <file>                                   Import contacts from CSV
  stats                                           Counts, companies, activity

Options:
  --data <path>    Use a different database file
  -h, --help       Show this help
  -v, --version    Show the version
`;

function parseArgs(argv) {
  const positional = [];
  const flags = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positional.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      if (eq !== -1) {
        flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      } else if (i + 1 < argv.length && !argv[i + 1].startsWith('-')) {
        flags[arg.slice(2)] = argv[++i];
      } else {
        flags[arg.slice(2)] = true;
      }
    } else if (arg.startsWith('-') && arg.length > 1) {
      for (const ch of arg.slice(1)) flags[ch] = true;
    } else {
      positional.push(arg);
    }
  }
  return { positional, flags };
}

function main(argv) {
  const { positional, flags } = parseArgs(argv);

  if (flags.h || flags.help || positional[0] === 'help') {
    process.stdout.write(HELP);
    return 0;
  }
  if (flags.v || flags.version) {
    process.stdout.write(`contact-cli ${VERSION}\n`);
    return 0;
  }

  const [command, ...rest] = positional;
  if (!command) {
    process.stdout.write(HELP);
    return 0;
  }

  const handler = commands[command];
  if (!handler) {
    process.stderr.write(`unknown command: ${command}\nRun 'contact --help' for a list of commands.\n`);
    return 1;
  }

  const dataPath = flags.data || store.defaultDataPath();
  try {
    const db = store.load(dataPath);
    const result = handler({ db, args: rest, flags, dataPath });
    if (result && result.changed) store.save(dataPath, db);
    if (result && result.output) process.stdout.write(result.output);
    return 0;
  } catch (err) {
    process.stderr.write(`error: ${err.message}\n`);
    return 1;
  }
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = { main, parseArgs, HELP };
