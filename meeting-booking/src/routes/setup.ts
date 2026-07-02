import { Router } from 'express';
import type { DB } from '../db.js';
import { hashPassword } from '../auth.js';
import { loadConfig } from '../config.js';

export function setupRoutes(db: DB) {
  const r = Router();
  const cfg = loadConfig();

  function blockIfUsersExist(_req: any, res: any, next: any) {
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    if (row.c > 0) return res.status(404).send('Not found');
    next();
  }

  r.get('/setup', blockIfUsersExist, (_req, res) => {
    res.render('setup', { title: 'Initial setup', error: null, defaultTimezone: cfg.defaultTimezone });
  });

  r.post('/setup', blockIfUsersExist, async (req, res) => {
    const { username, password, display_name, email, timezone } = req.body as Record<string, string>;
    if (!username || !password || !display_name || !email || !timezone) {
      return res.status(400).render('setup', { title: 'Initial setup', error: 'All fields are required', defaultTimezone: cfg.defaultTimezone });
    }
    if (password.length < 12) {
      return res.status(400).render('setup', { title: 'Initial setup', error: 'Password must be at least 12 characters', defaultTimezone: cfg.defaultTimezone });
    }
    let validTzs: string[];
    try { validTzs = Intl.supportedValuesOf('timeZone'); }
    catch { validTzs = ['UTC']; }
    if (!validTzs.includes(timezone) && timezone !== 'UTC' && timezone !== 'Etc/UTC' && timezone !== 'Etc/GMT') {
      return res.status(400).render('setup', { title: 'Initial setup', error: 'Invalid time zone', defaultTimezone: cfg.defaultTimezone });
    }
    const hash = await hashPassword(password);
    try {
      db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                  VALUES (?, ?, 'admin', ?, ?, ?, ?)`)
        .run(username, hash, timezone, display_name, email, new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).render('setup', { title: 'Initial setup', error: `Could not create user: ${msg}`, defaultTimezone: cfg.defaultTimezone });
    }
    res.redirect('/login');
  });

  return r;
}
