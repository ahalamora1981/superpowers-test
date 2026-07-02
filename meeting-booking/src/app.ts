import express from 'express';
import session from 'express-session';
import bodyParser from 'body-parser';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DB } from './db.js';
import type { Config } from './config.js';
import { csrfProtection } from './middleware/csrf.js';
import { exposeLocals } from './middleware/locals.js';
import { securityMiddleware } from './middleware/security.js';
import { notFoundHandler, errorHandler } from './middleware/errorHandler.js';
import { openDb, runMigrations } from './db.js';
import { addDays } from './lib/time.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export interface CreateAppDeps { db?: DB; autoMigrate?: boolean; }

export function createApp(config: Config, deps: CreateAppDeps = {}) {
  const db = deps.db ?? openDb(config.databasePath);
  if (deps.autoMigrate !== false) runMigrations(db);

  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.locals.addDays = addDays;
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: config.https },
  }));
  app.use(securityMiddleware(config));
  app.use(csrfProtection);
  app.use(exposeLocals(db));

  // Health check (no auth, no CSRF, no first-run gate)
  app.get('/healthz', (_req, res) => {
    try { db.prepare('SELECT 1').get(); res.json({ ok: true, db: 'up' }); }
    catch (err) { res.status(503).json({ ok: false, db: 'down', error: (err as Error).message }); }
  });

  // App routes are mounted by server.ts (see Task 17).
  app.use(notFoundHandler);
  app.use(errorHandler);
  (app as any).__db = db;
  return app;
}
