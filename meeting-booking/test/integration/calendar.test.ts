import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { hashPassword } from '../../src/auth.js';
import { calendarRoutes } from '../../src/routes/calendar.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
  process.env.CALENDAR_START_HOUR = '8';
  process.env.CALENDAR_END_HOUR = '20';
}

describe('calendar', () => {
  let db: ReturnType<typeof createTestDb>;
  let uid: number;
  beforeEach(async () => {
    makeEnv(); db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('alice', ?, 'admin', 'UTC', 'Alice', 'a@x.com', ?)`).run(hash, new Date().toISOString());
    uid = (db.prepare("SELECT id FROM users WHERE username='alice'").get() as any).id;
    db.prepare(`INSERT INTO meetings (title, description, organizer_id, start_utc, end_utc, timezone, join_url, status, sequence, created_at, updated_at)
                VALUES ('Standup', '', ?, '2026-07-08T10:00:00.000Z', '2026-07-08T10:15:00.000Z', 'UTC', 'https://x', 'scheduled', 0, ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
  });

  function app() {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = uid; next(); });
    a.use(calendarRoutes(db));
    return a;
  }

  it('GET / shows the calendar shell (table + nav buttons)', async () => {
    const res = await request(app()).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<table/);
    expect(res.text).toContain('Calendar — week of');
    expect(res.text).toContain('Today');
  });

  it('GET /calendar?week=YYYY-MM-DD returns the grid partial only (HTMX)', async () => {
    const res = await request(app()).get('/calendar?week=2026-07-06');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Standup');
  });

  it('GET / requires auth', async () => {
    const a = buildTestApp(loadConfig(), db);
    a.use(calendarRoutes(db));
    const res = await request(a).get('/');
    expect(res.status).toBe(302);
  });

  it('week= parameter is required to be a date', async () => {
    const res = await request(app()).get('/calendar?week=garbage');
    expect(res.status).toBe(400);
  });
});
