import type { Request, Response, NextFunction } from 'express';
import type { DB } from '../../db.js';
import { getCsrfToken } from './csrf.js';

export function exposeLocals(db: DB) {
  return (req: Request, res: Response, next: NextFunction) => {
    res.locals.csrfToken = getCsrfToken(req);
    res.locals.currentUser = req.session.userId
      ? db.prepare('SELECT id, username, role, display_name, email, timezone FROM users WHERE id = ?').get(req.session.userId)
      : null;
    next();
  };
}
