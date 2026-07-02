import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
mkdirSync(dirname(config.databasePath), { recursive: true });
mkdirSync(dirname(config.sessionsDatabasePath), { recursive: true });
const app = createApp(config);
const port = config.port;
app.listen(port, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`meeting-booking listening on http://127.0.0.1:${port}`);
});
