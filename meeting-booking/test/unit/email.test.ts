import { describe, it, expect, beforeEach } from 'vitest';
import { createMailer } from '../../src/lib/email.js';
import { createTestDb } from '../helpers/db.js';
import { createFakeSmtp } from '../helpers/fakeSmtp.js';

const cfg = { host: 'fake', port: 0, secure: false, user: '', pass: '', from: 'm@example.com' };

describe('email pipeline', () => {
  let db: ReturnType<typeof createTestDb>;
  let smtp: ReturnType<typeof createFakeSmtp>;

  beforeEach(() => {
    db = createTestDb();
    smtp = createFakeSmtp();
    // Seed a user and a meeting so email_send_log can satisfy its FK
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('u', 'h', 'member', 'UTC', 'U', 'u@x.com', ?)`).run(new Date().toISOString());
    const uid = (db.prepare("SELECT id FROM users WHERE username='u'").get() as any).id;
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('m', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
  });

  it('sends an invite with .ics attached and logs to email_send_log', async () => {
    const mid = (db.prepare("SELECT id FROM meetings").get() as any).id;
    const mailer = createMailer(cfg, smtp.transport);
    const result = await mailer.send({
      db, meetingId: mid, to: 'b@x.com', subject: 'subj', text: 'txt', html: '<p>hi</p>',
      ics: 'BEGIN:VCALENDAR\r\nEND:VCALENDAR\r\n', icsFilename: 'invite.ics', kind: 'invite',
    });
    expect(result.ok).toBe(true);
    expect(smtp.messages).toHaveLength(1);
    expect(smtp.messages[0].attachments[0].filename).toBe('invite.ics');
    const log = db.prepare("SELECT * FROM email_send_log").all() as any[];
    expect(log).toHaveLength(1);
    expect(log[0].status).toBe('sent');
    expect(log[0].kind).toBe('invite');
  });

  it('does not throw when transport fails; logs failure', async () => {
    const mid = (db.prepare("SELECT id FROM meetings").get() as any).id;
    const mailer = createMailer(cfg, smtp.transport);
    (smtp.transport as any).sendMail = () => { throw new Error('boom'); };
    const result = await mailer.send({
      db, meetingId: mid, to: 'b@x.com', subject: 's', text: '', html: '',
      ics: 'x', icsFilename: 'invite.ics', kind: 'invite',
    });
    expect(result.ok).toBe(false);
    const log = db.prepare("SELECT * FROM email_send_log").all() as any[];
    expect(log[0].status).toBe('failed');
    expect(log[0].error).toContain('boom');
  });
});
