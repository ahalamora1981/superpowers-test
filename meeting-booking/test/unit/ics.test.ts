import { describe, it, expect } from 'vitest';
import { generateIcs } from '../../src/lib/ics.js';

const base = {
  id: 42,
  title: 'Design review',
  description: 'Looking at the new mockups',
  organizer: { name: 'Alice', email: 'alice@example.com' },
  startUtc: '2026-07-02T17:00:00.000Z',
  endUtc: '2026-07-02T18:00:00.000Z',
  timezone: 'America/Los_Angeles',
  joinUrl: 'https://meet.example.com/abc',
  sequence: 0,
  participants: [{ email: 'bob@example.com', name: 'Bob' }],
  hostname: 'meet.example.com',
};

describe('ics generation', () => {
  it('REQUEST contains UID, METHOD, summary, attendees, URL', () => {
    const out = generateIcs(base, 'REQUEST');
    expect(out).toContain('UID:meeting-42@meet.example.com');
    expect(out).toContain('METHOD:REQUEST');
    expect(out).toContain('SUMMARY:Design review');
    expect(out).toContain('https://meet.example.com/abc');
    expect(out).toContain('ATTENDEE');
    expect(out).toContain('bob@example.com');
    expect(out).toContain('SEQUENCE:0');
  });

  it('CANCEL uses METHOD:CANCEL and STATUS:CANCELLED', () => {
    const out = generateIcs(base, 'CANCEL');
    expect(out).toContain('METHOD:CANCEL');
    expect(out).toContain('STATUS:CANCELLED');
  });

  it('Sequence is included', () => {
    const out = generateIcs({ ...base, sequence: 3 }, 'REQUEST');
    expect(out).toContain('SEQUENCE:3');
  });

  it('Output is a VCALENDAR', () => {
    const out = generateIcs(base, 'REQUEST');
    expect(out).toMatch(/BEGIN:VCALENDAR[\s\S]+END:VCALENDAR/);
  });
});
