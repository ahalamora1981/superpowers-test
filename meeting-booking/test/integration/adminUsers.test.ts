import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { adminRoutes } from '../../src/routes/admin.js';
import { loadConfig } from '../../src/config.js';
import { hashPassword } from '../../src/auth.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

async function seedAdmin(db: any) {
  const hash = await hashPassword('super-long-test-password');
  db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
              VALUES ('admin1', ?, 'admin', 'UTC', 'Admin One', 'a@x.com', ?)`)
    .run(hash, new Date().toISOString());
}

async function seedMember(db: any, username: string, role: string = 'member') {
  const hash = await hashPassword('another-long-password');
  db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
              VALUES (?, ?, ?, 'UTC', 'M', 'm@x.com', ?)`).run(username, hash, role, new Date().toISOString());
  return (db.prepare("SELECT id FROM users WHERE username = ?").get(username) as any).id;
}

describe('admin: users', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(async () => { makeEnv(); db = createTestDb(); await seedAdmin(db); });

  function asAdmin() {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = 1; next(); });
    a.use(adminRoutes(db));
    return a;
  }

  function asUser(id: number) {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = id; next(); });
    a.use(adminRoutes(db));
    return a;
  }

  it('GET /admin/users lists users (admin)', async () => {
    const res = await request(asAdmin()).get('/admin/users');
    expect(res.status).toBe(200);
    expect(res.text).toContain('admin1');
  });

  it('GET /admin/users 403 for member', async () => {
    const memberId = await seedMember(db, 'mem1', 'member');
    const res = await request(asUser(memberId)).get('/admin/users');
    expect(res.status).toBe(403);
  });

  it('POST /admin/users creates a member', async () => {
    const a = asAdmin();
    const agent = request.agent(a);
    const get = await agent.get('/admin/users');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post('/admin/users').type('form').send({
      _csrf: token, username: 'newmem', password: 'long-enough-password',
      display_name: 'New Member', email: 'n@x.com', timezone: 'UTC', role: 'member',
    });
    expect(res.status).toBe(302);
    const u = db.prepare("SELECT role, timezone FROM users WHERE username = 'newmem'").get() as any;
    expect(u.role).toBe('member');
  });

  it('POST /admin/users/:id/delete is blocked when user has scheduled meetings', async () => {
    const memberId = await seedMember(db, 'memb1', 'member');
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES (?, ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run('Test', memberId, new Date().toISOString(), new Date().toISOString());
    const a = asAdmin();
    const agent = request.agent(a);
    const get = await agent.get('/admin/users');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post(`/admin/users/${memberId}/delete`).type('form').send({ _csrf: token });
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/scheduled meetings/i);
    expect(db.prepare("SELECT id FROM users WHERE id = ?").get(memberId)).toBeDefined();
  });

  it('POST /admin/users/:id/delete succeeds when user has no scheduled meetings', async () => {
    const memberId = await seedMember(db, 'memb2', 'member');
    const a = asAdmin();
    const agent = request.agent(a);
    const get = await agent.get('/admin/users');
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post(`/admin/users/${memberId}/delete`).type('form').send({ _csrf: token });
    expect(res.status).toBe(302);
    expect(db.prepare("SELECT id FROM users WHERE id = ?").get(memberId)).toBeUndefined();
  });
});
