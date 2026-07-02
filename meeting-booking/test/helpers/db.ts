import { openDb, runMigrations } from '../../src/db.js';

export function createTestDb() {
  const db = openDb(':memory:');
  runMigrations(db);
  return db;
}
