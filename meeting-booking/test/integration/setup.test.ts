import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { firstRunGate } from '../../src/middleware/firstRunGate.js';
import { setupRoutes } from '../../src/routes/setup.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

describe('first-run setup', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { makeEnv(); db = createTestDb(); });

  it('redirects / to /setup when no users exist', async () => {
    const a = buildTestApp(loadConfig(), db);
    a.use(firstRunGate(db));
    a.use(setupRoutes(db));
    const res = await request(a).get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/setup');
  });

  it('GET /setup shows the form when no users exist', async () => {
    const a = buildTestApp(loadConfig(), db);
    a.use(firstRunGate(db));
    a.use(setupRoutes(db));
    const res = await request(a).get('/setup');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/name="username"/);
  });

  it('POST /setup creates the initial admin and redirects to /login', async () => {
    const a = buildTestApp(loadConfig(), db);
    a.use(firstRunGate(db));
    a.use(setupRoutes(db));
    const agent = request.agent(a);
    const get = await agent.get('/setup');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/setup').type('form').send({
      _csrf: token,
      username: 'root', password: 'a-very-long-password',
      display_name: 'Root', email: 'root@example.com', timezone: 'UTC',
    });
    if (res.status !== 302) {
      // eslint-disable-next-line no-console
      console.error('Response:', res.status, res.text);
    }
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    const u = db.prepare('SELECT role FROM users WHERE username = ?').get('root') as { role: string };
    expect(u.role).toBe('admin');
  });

  it('blocks /setup when users already exist', async () => {
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('x', 'h', 'admin', 'UTC', 'X', 'x@x.com', ?)`).run(new Date().toISOString());
    const a = buildTestApp(loadConfig(), db);
    a.use(firstRunGate(db));
    a.use(setupRoutes(db));
    const res = await request(a).get('/setup');
    expect(res.status).toBe(404);
  });
});
