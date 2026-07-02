import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from '../src/config.js';
import { openDb, runMigrations } from '../src/db.js';
import { hashPassword } from '../src/auth.js';

function arg(name: string): string {
  const i = process.argv.indexOf(`--${name}`);
  if (i === -1) throw new Error(`Missing --${name}`);
  return process.argv[i + 1];
}

async function main() {
  const username = arg('username');
  const password = arg('password');
  const displayName = process.argv.includes('--display-name') ? arg('display-name') : username;
  const email = process.argv.includes('--email') ? arg('email') : `${username}@localhost`;
  const timezone = process.argv.includes('--timezone') ? arg('timezone') : loadConfig().defaultTimezone;
  const role = process.argv.includes('--role') ? arg('role') : 'admin';

  if (password.length < 12) throw new Error('Password must be at least 12 characters');
  if (!['member', 'admin'].includes(role)) throw new Error('Role must be member or admin');

  const config = loadConfig();
  mkdirSync(dirname(config.databasePath), { recursive: true });
  const db = openDb(config.databasePath);
  runMigrations(db);

  const hash = await hashPassword(password);
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username) as { id: number } | undefined;
  if (existing) {
    db.prepare('UPDATE users SET password_hash = ?, role = ? WHERE id = ?').run(hash, role, existing.id);
    // eslint-disable-next-line no-console
    console.log(`Updated user ${username}`);
  } else {
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run(username, hash, role, timezone, displayName, email, new Date().toISOString());
    // eslint-disable-next-line no-console
    console.log(`Created user ${username}`);
  }
  db.close();
}

main().catch((err) => { console.error(err); process.exit(1); });
