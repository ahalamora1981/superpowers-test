import ical from 'ical-generator';

export interface MeetingForIcs {
  id: number;
  title: string;
  description: string | null;
  organizer: { name: string; email: string };
  startUtc: string;
  endUtc: string;
  timezone: string;
  joinUrl: string;
  sequence: number;
  participants: { email: string; name?: string | null }[];
  hostname: string;
}

export function generateIcs(m: MeetingForIcs, method: 'REQUEST' | 'CANCEL'): string {
  const cal = ical({
    name: 'Meeting',
    method,
    prodId: { company: 'meeting-booking', product: 'meeting-booking', language: 'EN' },
  });

  const event = cal.createEvent({
    id: `meeting-${m.id}@${m.hostname}`,
    sequence: m.sequence,
    start: new Date(m.startUtc),
    end: new Date(m.endUtc),
    timezone: m.timezone,
    summary: m.title,
    description: m.description ?? '',
    url: m.joinUrl,
    location: m.joinUrl,
    status: method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED',
    organizer: { name: m.organizer.name, email: m.organizer.email },
  });

  for (const p of m.participants) {
    event.createAttendee({ email: p.email, name: p.name ?? undefined, rsvp: false });
  }

  return cal.toString();
}
