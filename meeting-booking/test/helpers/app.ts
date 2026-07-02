import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from '../../src/db.js';
import type { Config } from '../../src/config.js';
import { csrfProtection, getCsrfToken } from '../../src/middleware/csrf.js';
import { exposeLocals } from '../../src/middleware/locals.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function buildTestApp(config: Config, db: DB) {
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, '..', '..', 'src', 'views'));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: false },
  }));
  app.use(csrfProtection);
  app.use(exposeLocals(db));
  return app;
}
