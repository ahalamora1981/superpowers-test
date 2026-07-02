import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { hashPassword, verifyPassword } from '../auth.js';

function isValidTimeZone(tz: string): boolean {
  try { new Intl.DateTimeFormat('en', { timeZone: tz }).format(new Date()); return true; }
  catch { return false; }
}

export function profileRoutes(db: DB) {
  const r = Router();
  r.get('/profile', requireAuth, (req, res) => {
    const u = db.prepare('SELECT id, username, display_name, email, timezone, role FROM users WHERE id = ?').get(req.session.userId);
    res.render('profile', { title: 'Profile', user: u, error: null, success: null });
  });

  r.post('/profile', requireAuth, async (req, res) => {
    const { display_name, email, timezone, current_password, new_password } = req.body as Record<string, string>;
    const u = db.prepare('SELECT * FROM users WHERE id = ?').get(req.session.userId) as any;
    if (!display_name || !email || !timezone) {
      return res.status(400).render('profile', { title: 'Profile', user: u, error: 'All fields are required', success: null });
    }
    if (!isValidTimeZone(timezone)) {
      return res.status(400).render('profile', { title: 'Profile', user: u, error: 'Invalid time zone', success: null });
    }
    let passwordHash = u.password_hash;
    if (new_password) {
      if (!current_password || !(await verifyPassword(u.password_hash, current_password))) {
        return res.status(400).render('profile', { title: 'Profile', user: u, error: 'Current password is incorrect', success: null });
      }
      if (new_password.length < 12) {
        return res.status(400).render('profile', { title: 'Profile', user: u, error: 'New password must be at least 12 characters', success: null });
      }
      passwordHash = await hashPassword(new_password);
    }
    db.prepare('UPDATE users SET display_name = ?, email = ?, timezone = ?, password_hash = ? WHERE id = ?')
      .run(display_name, email, timezone, passwordHash, req.session.userId);
    res.render('profile', { title: 'Profile', user: { ...u, display_name, email, timezone }, error: null, success: 'Profile updated' });
  });

  return r;
}
