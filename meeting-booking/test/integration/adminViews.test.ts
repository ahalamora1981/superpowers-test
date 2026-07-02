import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { hashPassword } from '../../src/auth.js';
import { adminRoutes } from '../../src/routes/admin.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

describe('admin views: all meetings, email log', () => {
  let db: ReturnType<typeof createTestDb>;
  let adminId: number;
  beforeEach(async () => {
    makeEnv(); db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('admin1', ?, 'admin', 'UTC', 'Admin', 'a@x.com', ?)`).run(hash, new Date().toISOString());
    adminId = (db.prepare("SELECT id FROM users WHERE username='admin1'").get() as any).id;
    db.prepare(`INSERT INTO meetings (title, description, organizer_id, start_utc, end_utc, timezone, join_url, status, sequence, created_at, updated_at)
                VALUES ('X', '', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', 0, ?, ?)`)
      .run(adminId, new Date().toISOString(), new Date().toISOString());
  });

  function app() {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = adminId; next(); });
    a.use(adminRoutes(db));
    return a;
  }

  it('GET /admin/meetings lists meetings', async () => {
    const res = await request(app()).get('/admin/meetings');
    expect(res.status).toBe(200);
    expect(res.text).toContain('X');
  });

  it('GET /admin/email-log shows the table', async () => {
    db.prepare(`INSERT INTO email_send_log (meeting_id, recipient, kind, status, sent_at) VALUES (1, 'b@x.com', 'invite', 'sent', ?)`)
      .run(new Date().toISOString());
    const res = await request(app()).get('/admin/email-log');
    expect(res.status).toBe(200);
    expect(res.text).toContain('b@x.com');
  });
});
