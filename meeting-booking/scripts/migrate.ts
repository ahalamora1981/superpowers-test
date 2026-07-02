import { loadConfig } from '../src/config.js';
import { openDb, runMigrations } from '../src/db.js';

const config = loadConfig();
const db = openDb(config.databasePath);
runMigrations(db);
db.close();
// eslint-disable-next-line no-console
console.log(`Migrations applied to ${config.databasePath}`);
