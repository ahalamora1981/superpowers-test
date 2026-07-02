import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { hashPassword } from '../../src/auth.js';
import { authRoutes } from '../../src/routes/auth.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

describe('auth routes', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => {
    makeEnv();
    db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?)`)
      .run('alice', hash, 'admin', 'UTC', 'Alice', 'a@x.com', new Date().toISOString());
  });

  function app() {
    const a = buildTestApp(loadConfig(), db);
    a.use(authRoutes(db));
    return a;
  }

  it('GET /login shows the form with a CSRF token', async () => {
    const res = await request(app()).get('/login');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/name="_csrf" value="[^"]+"/);
  });

  it('POST /login with correct creds redirects to /', async () => {
    const a = app();
    const agent = request.agent(a);
    const get = await agent.get('/login');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/login').type('form').send({ _csrf: token, username: 'alice', password: 'super-long-test-password' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/');
  });

  it('POST /login with wrong password shows generic error', async () => {
    const a = app();
    const agent = request.agent(a);
    const get = await agent.get('/login');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/login').type('form').send({ _csrf: token, username: 'alice', password: 'nope' });
    expect(res.status).toBe(401);
    expect(res.text).toContain('Invalid username or password');
  });

  it('POST /login with missing CSRF is 403', async () => {
    const res = await request(app()).post('/login').type('form').send({ username: 'alice', password: 'x' });
    expect(res.status).toBe(403);
  });

  it('POST /logout requires auth (no CSRF token)', async () => {
    const res = await request(app()).post('/logout');
    expect(res.status).toBe(403); // CSRF check runs before requireAuth
  });

  it('POST /logout redirects unauthenticated user with valid CSRF', async () => {
    const a = app();
    const agent = request.agent(a);
    const get = await agent.get('/login');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/logout').type('form').send({ _csrf: token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
  });
});
