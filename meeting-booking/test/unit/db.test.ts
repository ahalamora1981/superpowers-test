import { describe, it, expect, beforeEach } from 'vitest';
import { openDb, runMigrations, getSetting, setSetting } from '../../src/db.js';

describe('db', () => {
  let db: ReturnType<typeof openDb>;
  beforeEach(() => { db = openDb(':memory:'); runMigrations(db); });

  it('creates all expected tables', () => {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all() as { name: string }[];
    const names = tables.map((t) => t.name);
    expect(names).toContain('users');
    expect(names).toContain('meetings');
    expect(names).toContain('participants');
    expect(names).toContain('email_send_log');
    expect(names).toContain('migrations');
  });

  it('migrations are idempotent', () => {
    runMigrations(db);
    runMigrations(db);
    const count = (db.prepare("SELECT COUNT(*) as c FROM migrations").get() as { c: number }).c;
    expect(count).toBe(1);
  });

  it('getSetting / setSetting round-trip', () => {
    expect(getSetting(db, 'foo')).toBeNull();
    setSetting(db, 'foo', 'bar');
    expect(getSetting(db, 'foo')).toBe('bar');
  });
});
