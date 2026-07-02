import type { Request, Response, NextFunction } from 'express';
import type { DB } from '../db.js';

export function firstRunGate(db: DB) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (req.path === '/setup' || req.path.startsWith('/setup/') || req.path === '/healthz') return next();
    const row = db.prepare('SELECT COUNT(*) as c FROM users').get() as { c: number };
    if (row.c === 0) return res.redirect('/setup');
    next();
  };
}
