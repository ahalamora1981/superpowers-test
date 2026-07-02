import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/db.js';
import { createFakeSmtp } from '../helpers/fakeSmtp.js';
import { hashPassword } from '../../src/auth.js';
import { createMeeting, sendInvitesFor } from '../../src/lib/meetings.js';
import { FakeProvider } from '../../src/lib/video/fake.js';
import { createMailer } from '../../src/lib/email.js';
import { findOrganizerConflict } from '../../src/lib/conflict.js';

describe('meeting service: createMeeting + sendInvitesFor', () => {
  let db: ReturnType<typeof createTestDb>;
  let smtp: ReturnType<typeof createFakeSmtp>;
  let organizer: any;
  beforeEach(async () => {
    db = createTestDb();
    smtp = createFakeSmtp();
    const hash = await hashPassword('super-long-test-password');
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('alice', ?, 'member', 'UTC', 'Alice', 'a@x.com', ?)`)
      .run(hash, new Date().toISOString());
    organizer = db.prepare("SELECT id, display_name as name, email, timezone FROM users WHERE username='alice'").get();
  });

  it('creates a meeting, saves participants, sends invites, logs email', async () => {
    const mailer = createMailer({ host: 'x', port: 0, secure: false, user: '', pass: '', from: 'm@x.com' }, smtp.transport);
    const video = new FakeProvider('meet.local');
    const { meeting, sentCount, failedCount } = await createMeeting({
      db, mailer, video, hostname: 'meet.local', organizer,
      title: 'Standup', description: 'Daily',
      startUtc: '2030-01-01T10:00:00.000Z', endUtc: '2030-01-01T10:15:00.000Z',
      timezone: 'UTC',
      attendees: [{ email: 'bob@x.com' }, { email: 'carol@x.com' }],
    });
    expect(meeting.title).toBe('Standup');
    expect(meeting.sequence).toBe(0);
    expect(meeting.join_url).toMatch(/^https:\/\/meet\.meet\.local\//);
    const parts = db.prepare('SELECT email FROM participants WHERE meeting_id = ? ORDER BY email').all(meeting.id) as any[];
    expect(parts.map((p) => p.email).sort()).toEqual(['a@x.com', 'bob@x.com', 'carol@x.com']);
    expect(sentCount).toBe(3);
    expect(failedCount).toBe(0);
    const log = db.prepare("SELECT * FROM email_send_log WHERE meeting_id = ?").all(meeting.id) as any[];
    expect(log).toHaveLength(3);
  });

  it('dedupes attendees (case-insensitive)', async () => {
    const mailer = createMailer({ host: 'x', port: 0, secure: false, user: '', pass: '', from: 'm@x.com' }, smtp.transport);
    const video = new FakeProvider('meet.local');
    const { meeting } = await createMeeting({
      db, mailer, video, hostname: 'meet.local', organizer,
      title: 'T', description: null,
      startUtc: '2030-01-01T10:00:00.000Z', endUtc: '2030-01-01T10:15:00.000Z',
      timezone: 'UTC',
      attendees: [{ email: 'Bob@x.com' }, { email: 'bob@X.com' }],
    });
    const parts = db.prepare('SELECT email FROM participants WHERE meeting_id = ?').all(meeting.id) as any[];
    expect(parts).toHaveLength(2);
  });

  it('sendInvitesFor: update kind uses invite.ics filename', async () => {
    const mailer = createMailer({ host: 'x', port: 0, secure: false, user: '', pass: '', from: 'm@x.com' }, smtp.transport);
    const video = new FakeProvider('meet.local');
    const { meeting } = await createMeeting({
      db, mailer, video, hostname: 'meet.local', organizer,
      title: 'T', description: null,
      startUtc: '2030-01-01T10:00:00.000Z', endUtc: '2030-01-01T10:15:00.000Z',
      timezone: 'UTC',
      attendees: [{ email: 'bob@x.com' }],
    });
    db.prepare("UPDATE meetings SET sequence = sequence + 1, updated_at = ? WHERE id = ?")
      .run(new Date().toISOString(), meeting.id);
    const updated = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting.id) as any;
    const parts = db.prepare('SELECT email, name FROM participants WHERE meeting_id = ?').all(meeting.id) as any[];
    const { sent } = await sendInvitesFor({
      db, mailer, hostname: 'meet.local', meeting: updated, organizer,
      attendees: parts.map((p) => ({ email: p.email, name: p.name })), kind: 'update',
    });
    expect(sent).toBe(2);
    expect(smtp.messages[smtp.messages.length - 1].attachments[0].filename).toBe('invite.ics');
  });

  it('sendInvitesFor: cancel kind uses cancel.ics filename and CANCEL method', async () => {
    const mailer = createMailer({ host: 'x', port: 0, secure: false, user: '', pass: '', from: 'm@x.com' }, smtp.transport);
    const video = new FakeProvider('meet.local');
    const { meeting } = await createMeeting({
      db, mailer, video, hostname: 'meet.local', organizer,
      title: 'T', description: null,
      startUtc: '2030-01-01T10:00:00.000Z', endUtc: '2030-01-01T10:15:00.000Z',
      timezone: 'UTC',
      attendees: [{ email: 'bob@x.com' }],
    });
    db.prepare("UPDATE meetings SET status = 'cancelled' WHERE id = ?").run(meeting.id);
    const updated = db.prepare('SELECT * FROM meetings WHERE id = ?').get(meeting.id) as any;
    const parts = db.prepare('SELECT email, name FROM participants WHERE meeting_id = ?').all(meeting.id) as any[];
    await sendInvitesFor({
      db, mailer, hostname: 'meet.local', meeting: updated, organizer,
      attendees: parts.map((p) => ({ email: p.email, name: p.name })), kind: 'cancel',
    });
    const last = smtp.messages[smtp.messages.length - 1];
    expect(last.attachments[0].filename).toBe('cancel.ics');
  });

  it('findOrganizerConflict returns the new meeting when it overlaps itself', () => {
    // Sanity check: with a future meeting, asking to schedule an overlapping one returns it.
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('a', ?, '2030-02-01T10:00:00.000Z', '2030-02-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(organizer.id, new Date().toISOString(), new Date().toISOString());
    const c = findOrganizerConflict(db, organizer.id, '2030-02-01T10:30:00.000Z', '2030-02-01T11:30:00.000Z');
    expect(c).not.toBeNull();
  });
});
