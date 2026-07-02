import type { Request, Response, NextFunction } from 'express';
import type { DB } from '../db.js';

export function requireAdmin(db: DB) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Only enforce for paths under /admin/. This is mounted on a sub-router
    // via r.use(), so without this check it would intercept ALL requests
    // and cause spurious 403s/redirects for non-admin paths.
    if (!req.path.startsWith('/admin')) return next();
    if (!req.session.userId) return res.redirect('/login');
    const row = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId) as { role: string } | undefined;
    if (!row || row.role !== 'admin') {
      return res.status(403).send('Admin access required');
    }
    next();
  };
}
