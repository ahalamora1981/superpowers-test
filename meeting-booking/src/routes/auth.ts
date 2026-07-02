import { Router } from 'express';
import type { DB } from '../db.js';
import rateLimit from 'express-rate-limit';
import { verifyPassword } from '../auth.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function authRoutes(db: DB) {
  const r = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
  });

  r.get('/login', (req, res) => {
    if (req.session.userId) return res.redirect('/');
    res.render('login', { title: 'Sign in', error: null });
  });

  r.post('/login', loginLimiter, async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    if (!username || !password) {
      return res.status(400).render('login', { title: 'Sign in', error: 'Invalid username or password' });
    }
    const user = db.prepare('SELECT id, password_hash FROM users WHERE username = ?').get(username) as
      { id: number; password_hash: string } | undefined;
    if (!user || !(await verifyPassword(user.password_hash, password))) {
      return res.status(401).render('login', { title: 'Sign in', error: 'Invalid username or password' });
    }
    req.session.regenerate((err) => {
      if (err) return res.status(500).send('Session error');
      req.session.userId = user.id;
      req.session.save((err2) => {
        if (err2) return res.status(500).send('Session error');
        res.redirect('/');
      });
    });
  });

  r.post('/logout', requireAuth, (req, res) => {
    req.session.destroy(() => res.redirect('/login'));
  });

  return r;
}
