import { describe, it, expect, beforeEach } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { createTestDb } from '../helpers/db.js';
import { hashPassword } from '../../src/auth.js';
import { requireAuth } from '../../src/middleware/requireAuth.js';
import { requireAdmin } from '../../src/middleware/requireAdmin.js';

describe('auth middleware', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => {
    db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('alice', hash, 'admin', 'UTC', 'Alice', 'a@x.com', new Date().toISOString());
  });

  it('requireAuth redirects unauthenticated', async () => {
    const a = express();
    a.use(session({ secret: 'x'.repeat(32), resave: false, saveUninitialized: false }));
    a.use(requireAuth);
    a.get('/secret', (_req, res) => res.json({ ok: true }));
    const res = await request(a).get('/secret');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });

  it('requireAuth allows logged-in', async () => {
    const a = express();
    a.use(session({ secret: 'x'.repeat(32), resave: false, saveUninitialized: false }));
    a.use((req: any, _res: any, next: any) => { req.session.userId = 1; next(); });
    a.use(requireAuth);
    a.get('/secret', (_req, res) => res.json({ ok: true }));
    const res = await request(a).get('/secret');
    expect(res.status).toBe(200);
  });

  it('requireAdmin blocks non-admin', async () => {
    db.prepare(`UPDATE users SET role='member' WHERE username='alice'`).run();
    const a = express();
    a.use(session({ secret: 'x'.repeat(32), resave: false, saveUninitialized: false }));
    a.use((req: any, _res: any, next: any) => { req.session.userId = 1; next(); });
    a.use(requireAdmin(db));
    a.get('/admin', (_req, res) => res.json({ ok: true }));
    const res = await request(a).get('/admin');
    expect(res.status).toBe(403);
  });
});
