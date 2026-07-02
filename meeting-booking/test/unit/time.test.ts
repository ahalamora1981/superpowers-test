import { describe, it, expect } from 'vitest';
import { localToUtc, utcToZoned, formatInZone, weekStartMonday, addDays } from '../../src/lib/time.js';

describe('time', () => {
  it('localToUtc: 2026-07-02T10:00 in America/Los_Angeles (PDT, UTC-7) → 17:00Z', () => {
    expect(localToUtc('2026-07-02T10:00', 'America/Los_Angeles')).toBe('2026-07-02T17:00:00.000Z');
  });

  it('utcToZoned: 2026-07-02T17:00Z in Asia/Tokyo (JST, UTC+9) → 2026-07-03T02:00', () => {
    expect(utcToZoned('2026-07-02T17:00:00.000Z', 'Asia/Tokyo')).toBe('2026-07-03T02:00:00');
  });

  it('formatInZone: 2026-07-02T17:00Z in UTC', () => {
    const out = formatInZone('2026-07-02T17:00:00.000Z', 'UTC', { dateStyle: 'medium', timeStyle: 'short', locale: 'en-US' });
    expect(out).toBe('Jul 2, 2026, 5:00 PM');
  });

  it('round-trip localToUtc → utcToZoned is identity', () => {
    const local = '2026-07-02T10:00';
    const utc = localToUtc(local, 'America/Los_Angeles');
    expect(utcToZoned(utc, 'America/Los_Angeles')).toBe('2026-07-02T10:00:00');
  });

  it('weekStartMonday: a Wednesday returns the prior Monday', () => {
    const wed = new Date('2026-07-08T12:00:00Z');
    const mon = weekStartMonday(wed);
    expect(mon.toISOString().slice(0, 10)).toBe('2026-07-06');
  });

  it('addDays adds correctly', () => {
    const d = new Date('2026-03-08T12:00:00Z');
    expect(addDays(d, 7).toISOString().slice(0, 10)).toBe('2026-03-15');
  });
});
