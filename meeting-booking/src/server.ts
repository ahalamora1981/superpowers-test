import { loadConfig } from './config.js';
import { createApp } from './app.js';

const config = loadConfig();
const app = createApp(config);
app.listen(config.port, '127.0.0.1', () => {
  // eslint-disable-next-line no-console
  console.log(`meeting-booking listening on http://127.0.0.1:${config.port}`);
});
