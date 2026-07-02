import { randomBytes, timingSafeEqual } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

declare module 'express-session' {
  interface SessionData { csrfToken?: string; }
}

export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = randomBytes(24).toString('base64url');
  }
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }
  const sent = (req.body && req.body._csrf) || req.get('x-csrf-token');
  const expected = req.session.csrfToken;
  if (typeof sent !== 'string' || typeof expected !== 'string' || sent.length !== expected.length ||
      !timingSafeEqual(Buffer.from(sent), Buffer.from(expected))) {
    return res.status(403).send('Invalid CSRF token');
  }
  next();
}

export function getCsrfToken(req: Request): string {
  return req.session.csrfToken ?? '';
}
