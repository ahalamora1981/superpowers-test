import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import type { RequestHandler } from 'express';
import type { Config } from '../config.js';

export function securityMiddleware(config: Config): RequestHandler[] {
  const middlewares: RequestHandler[] = [
    helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "https://unpkg.com"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        imgSrc: ["'self'", "data:", "blob:"],
        connectSrc: ["'self'"],
      },
    },
  }) as unknown as RequestHandler,
  ];
  if (config.nodeEnv === 'production') {
    middlewares.push(rateLimit({ windowMs: 15 * 60 * 1000, max: 10, standardHeaders: true, legacyHeaders: false }) as unknown as RequestHandler);
  }
  return middlewares;
}
