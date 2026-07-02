import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { hashPassword } from '../../src/auth.js';
import { profileRoutes } from '../../src/routes/profile.js';
import { myMeetingsRoutes } from '../../src/routes/myMeetings.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

describe('profile + my-meetings', () => {
  let db: ReturnType<typeof createTestDb>;
  let uid: number;
  beforeEach(async () => {
    makeEnv(); db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('alice', ?, 'member', 'UTC', 'Alice', 'a@x.com', ?)`).run(hash, new Date().toISOString());
    uid = (db.prepare("SELECT id FROM users WHERE username='alice'").get() as any).id;
  });

  function app() {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = uid; next(); });
    a.use(profileRoutes(db));
    a.use(myMeetingsRoutes(db));
    return a;
  }

  it('GET /profile shows the form', async () => {
    const res = await request(app()).get('/profile');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Alice');
  });

  it('POST /profile updates timezone and shows success', async () => {
    const a = app();
    const agent = request.agent(a);
    const get = await agent.get('/profile');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/profile').type('form').send({
      _csrf: token, display_name: 'Alice', email: 'a@x.com', timezone: 'Europe/London',
    });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Profile updated');
    const u = db.prepare('SELECT timezone FROM users WHERE id = ?').get(uid) as any;
    expect(u.timezone).toBe('Europe/London');
  });

  it('GET /my-meetings returns empty list when no meetings', async () => {
    const res = await request(app()).get('/my-meetings');
    expect(res.status).toBe(200);
    expect(res.text).toContain('None.');
  });
});
