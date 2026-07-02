import type { DB } from '../db.js';

export interface ConflictRow {
  id: number;
  title: string;
  start_utc: string;
  end_utc: string;
}

export function findOrganizerConflict(
  db: DB,
  organizerId: number,
  startUtc: string,
  endUtc: string,
  excludeMeetingId?: number
): ConflictRow | null {
  if (excludeMeetingId !== undefined) {
    const row = db.prepare(`
      SELECT id, title, start_utc, end_utc FROM meetings
      WHERE organizer_id = ?
        AND status = 'scheduled'
        AND start_utc < ?
        AND end_utc > ?
        AND id != ?
      LIMIT 1
    `).get(organizerId, endUtc, startUtc, excludeMeetingId) as ConflictRow | undefined;
    return row ?? null;
  }
  const row = db.prepare(`
    SELECT id, title, start_utc, end_utc FROM meetings
    WHERE organizer_id = ?
      AND status = 'scheduled'
      AND start_utc < ?
      AND end_utc > ?
    LIMIT 1
  `).get(organizerId, endUtc, startUtc) as ConflictRow | undefined;
  return row ?? null;
}
