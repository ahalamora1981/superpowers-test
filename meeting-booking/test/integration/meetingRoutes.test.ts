import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/app.js';
import { createTestDb } from '../helpers/db.js';
import { createFakeSmtp } from '../helpers/fakeSmtp.js';
import { hashPassword } from '../../src/auth.js';
import { meetingRoutes } from '../../src/routes/meetings.js';
import { loadConfig } from '../../src/config.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
  process.env.VIDEO_PROVIDER = 'fake';
}

describe('meetings: HTTP routes (view, edit, cancel)', () => {
  let db: ReturnType<typeof createTestDb>;
  let aliceId: number; let meetingId: number;
  beforeEach(async () => {
    makeEnv();
    db = createTestDb();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('alice', ?, 'admin', 'UTC', 'Alice', 'a@x.com', ?)`).run(hash, new Date().toISOString());
    aliceId = (db.prepare("SELECT id FROM users WHERE username='alice'").get() as any).id;
    db.prepare(`INSERT INTO meetings (title, description, organizer_id, start_utc, end_utc, timezone, join_url, status, sequence, created_at, updated_at)
                VALUES ('Original', 'desc', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://meet.local/x', 'scheduled', 0, ?, ?)`)
      .run(aliceId, new Date().toISOString(), new Date().toISOString());
    meetingId = (db.prepare("SELECT id FROM meetings").get() as any).id;
    db.prepare('INSERT INTO participants (meeting_id, email, name) VALUES (?, ?, ?)').run(meetingId, 'bob@x.com', 'Bob');
  });

  function app() {
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = aliceId; next(); });
    a.use(meetingRoutes(db));
    return a;
  }

  it('GET /meetings/:id shows details', async () => {
    const res = await request(app()).get(`/meetings/${meetingId}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Original');
    expect(res.text).toContain('bob@x.com');
    expect(res.text).toContain('https://meet.local/x');
  });

  it('GET /meetings/:id 404 for missing', async () => {
    const res = await request(app()).get('/meetings/9999');
    expect(res.status).toBe(404);
  });

  it('POST /meetings/:id updates the meeting and bumps sequence', async () => {
    const a = app();
    const agent = request.agent(a);
    const get = await agent.get(`/meetings/${meetingId}/edit`);
    const token = get.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post(`/meetings/${meetingId}`).type('form').send({
      _csrf: token, title: 'Renamed', description: 'new',
      start: '2030-01-01T12:00', end: '2030-01-01T13:00', attendees: 'carol@x.com',
    });
    expect(res.status).toBe(302);
    const m = db.prepare('SELECT title, sequence FROM meetings WHERE id = ?').get(meetingId) as any;
    expect(m.title).toBe('Renamed');
    expect(m.sequence).toBe(1);
  });

  it('POST /meetings/:id/cancel sets status to cancelled', async () => {
    const a = app();
    const agent = request.agent(a);
    const details = await agent.get(`/meetings/${meetingId}`);
    const token = details.text.match(/name="_csrf" value="([^"]+)"/)![1];
    const res = await agent.post(`/meetings/${meetingId}/cancel`).type('form').send({ _csrf: token });
    expect(res.status).toBe(302);
    const m = db.prepare('SELECT status FROM meetings WHERE id = ?').get(meetingId) as any;
    expect(m.status).toBe('cancelled');
  });

  it('non-organizer non-admin member cannot edit', async () => {
    const hash = await hashPassword('another-long-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('bob', ?, 'member', 'UTC', 'Bob', 'b@x.com', ?)`).run(hash, new Date().toISOString());
    const bobId = (db.prepare("SELECT id FROM users WHERE username='bob'").get() as any).id;
    const a = buildTestApp(loadConfig(), db);
    a.use((req: any, _r: any, next: any) => { req.session.userId = bobId; next(); });
    a.use(meetingRoutes(db));
    const res = await request(a).get(`/meetings/${meetingId}/edit`);
    expect(res.status).toBe(403);
  });
});
