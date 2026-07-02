import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAdmin } from '../middleware/requireAdmin.js';
import { hashPassword } from '../auth.js';

export function adminRoutes(db: DB) {
  const r = Router();
  r.use(requireAdmin(db));

  function listUsers() {
    return db.prepare(`SELECT id, username, display_name, email, role, timezone, created_at
                       FROM users ORDER BY created_at ASC`).all();
  }

  r.get('/admin/users', (req, res) => {
    res.render('admin/users', { title: 'Users', users: listUsers(), error: null });
  });

  r.post('/admin/users', async (req, res) => {
    const { username, password, display_name, email, timezone, role } = req.body as Record<string, string>;
    if (!username || !password || !display_name || !email || !timezone || !['member', 'admin'].includes(role)) {
      return res.status(400).render('admin/users', { title: 'Users', users: listUsers(), error: 'All fields are required and role must be member or admin' });
    }
    if (password.length < 12) {
      return res.status(400).render('admin/users', { title: 'Users', users: listUsers(), error: 'Password must be at least 12 characters' });
    }
    try {
      const hash = await hashPassword(password);
      db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .run(username, hash, role, timezone, display_name, email, new Date().toISOString());
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return res.status(400).render('admin/users', { title: 'Users', users: listUsers(), error: `Could not create user: ${msg}` });
    }
    res.redirect('/admin/users');
  });

  r.post('/admin/users/:id/delete', (req, res) => {
    const id = Number(req.params.id);
    const scheduled = db.prepare(`SELECT COUNT(*) as c FROM meetings WHERE organizer_id = ? AND status = 'scheduled'`).get(id) as { c: number };
    if (scheduled.c > 0) {
      return res.status(400).render('admin/users', { title: 'Users', users: listUsers(), error: `Cannot delete: user has ${scheduled.c} scheduled meetings. Cancel them first.` });
    }
    db.prepare('DELETE FROM users WHERE id = ?').run(id);
    res.redirect('/admin/users');
  });

  return r;
}
