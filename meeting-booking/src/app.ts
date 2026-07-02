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
import { firstRunGate } from './middleware/firstRunGate.js';
import { openDb, runMigrations } from './db.js';
import { authRoutes } from './routes/auth.js';
import { setupRoutes } from './routes/setup.js';
import { calendarRoutes } from './routes/calendar.js';
import { meetingRoutes } from './routes/meetings.js';
import { adminRoutes } from './routes/admin.js';
import { profileRoutes } from './routes/profile.js';
import { myMeetingsRoutes } from './routes/myMeetings.js';
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
  app.use('/static', express.static(path.join(__dirname, 'static')));
  app.use(bodyParser.urlencoded({ extended: false }));
  app.use(session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: true,
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

  // First-run gate: redirect to /setup if no users.
  app.use(firstRunGate(db));

  // App routes
  app.use(authRoutes(db));
  app.use(setupRoutes(db));
  app.use(calendarRoutes(db));
  app.use(meetingRoutes(db));
  app.use(adminRoutes(db));
  app.use(profileRoutes(db));
  app.use(myMeetingsRoutes(db));

  app.use(notFoundHandler);
  app.use(errorHandler);
  (app as any).__db = db;
  return app;
}
