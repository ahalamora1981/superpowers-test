import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../helpers/db.js';
import { findOrganizerConflict } from '../../src/lib/conflict.js';

function seedUserAndMeeting(db: any) {
  db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
              VALUES ('u', 'h', 'member', 'UTC', 'U', 'u@x.com', ?)`).run(new Date().toISOString());
  return (db.prepare('SELECT id FROM users WHERE username = ?').get('u') as any).id;
}

describe('findOrganizerConflict', () => {
  let db: ReturnType<typeof createTestDb>;
  beforeEach(() => { db = createTestDb(); });

  it('returns null when no meetings exist', () => {
    const uid = seedUserAndMeeting(db);
    expect(findOrganizerConflict(db, uid, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z')).toBeNull();
  });

  it('detects an overlapping scheduled meeting', () => {
    const uid = seedUserAndMeeting(db);
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('existing', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
    const r = findOrganizerConflict(db, uid, '2030-01-01T10:30:00.000Z', '2030-01-01T11:30:00.000Z');
    expect(r).not.toBeNull();
    expect(r!.title).toBe('existing');
  });

  it('does not flag back-to-back meetings', () => {
    const uid = seedUserAndMeeting(db);
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('a', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
    expect(findOrganizerConflict(db, uid, '2030-01-01T11:00:00.000Z', '2030-01-01T12:00:00.000Z')).toBeNull();
  });

  it('ignores cancelled meetings', () => {
    const uid = seedUserAndMeeting(db);
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('a', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'cancelled', ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
    expect(findOrganizerConflict(db, uid, '2030-01-01T10:30:00.000Z', '2030-01-01T11:30:00.000Z')).toBeNull();
  });

  it('ignores other users\' meetings', () => {
    const uid = seedUserAndMeeting(db);
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('u2', 'h', 'member', 'UTC', 'U2', 'u2@x.com', ?)`).run(new Date().toISOString());
    const uid2 = (db.prepare("SELECT id FROM users WHERE username = 'u2'").get() as any).id;
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('a', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(uid2, new Date().toISOString(), new Date().toISOString());
    expect(findOrganizerConflict(db, uid, '2030-01-01T10:30:00.000Z', '2030-01-01T11:30:00.000Z')).toBeNull();
  });

  it('respects excludeMeetingId for edits', () => {
    const uid = seedUserAndMeeting(db);
    db.prepare(`INSERT INTO meetings (title, organizer_id, start_utc, end_utc, timezone, join_url, status, created_at, updated_at)
                VALUES ('a', ?, '2030-01-01T10:00:00.000Z', '2030-01-01T11:00:00.000Z', 'UTC', 'https://x', 'scheduled', ?, ?)`)
      .run(uid, new Date().toISOString(), new Date().toISOString());
    const id = (db.prepare("SELECT id FROM meetings").get() as any).id;
    expect(findOrganizerConflict(db, uid, '2030-01-01T10:30:00.000Z', '2030-01-01T11:30:00.000Z', id)).toBeNull();
  });
});
