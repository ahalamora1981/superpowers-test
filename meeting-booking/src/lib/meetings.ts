import { type DB, transaction } from '../db.js';
import type { VideoProvider } from './video/provider.js';
import type { EmailKind } from './email.js';
import { generateIcs } from './ics.js';

export interface OrganizerInfo { id: number; name: string; email: string; timezone: string; }
export interface AttendeeInput { email: string; name?: string | null; }

export interface MeetingRow {
  id: number; title: string; description: string | null;
  organizer_id: number; start_utc: string; end_utc: string; timezone: string;
  join_url: string; status: string; sequence: number;
  created_at: string; updated_at: string;
}

export interface CreateMeetingInput {
  db: DB;
  mailer: { send: (a: any) => Promise<{ ok: boolean }> };
  video: VideoProvider;
  hostname: string;
  organizer: OrganizerInfo;
  title: string;
  description: string | null;
  startUtc: string;
  endUtc: string;
  timezone: string;
  attendees: AttendeeInput[];
}

function dedupAttendees(attendees: AttendeeInput[], organizer: OrganizerInfo): AttendeeInput[] {
  const m = new Map<string, AttendeeInput>();
  for (const a of [...attendees, { email: organizer.email, name: organizer.name }]) m.set(a.email.toLowerCase(), a);
  return [...m.values()];
}

export async function createMeeting(input: CreateMeetingInput): Promise<{ meeting: MeetingRow; sentCount: number; failedCount: number }> {
  const { db, video, organizer, title, description, startUtc, endUtc, timezone, attendees, hostname } = input;
  const created = await video.createMeeting({ title, startUtc, endUtc, organizerEmail: organizer.email });
  const now = new Date().toISOString();
  const ins = db.prepare(`INSERT INTO meetings (title, description, organizer_id, start_utc, end_utc, timezone, join_url, status, sequence, created_at, updated_at)
                          VALUES (?, ?, ?, ?, ?, ?, ?, 'scheduled', 0, ?, ?)`);
  const pin = db.prepare('INSERT INTO participants (meeting_id, email, name) VALUES (?, ?, ?)');
  const dedup = dedupAttendees(attendees, organizer);

  let id: number;
  transaction(db, () => {
    const info = ins.run(title, description, organizer.id, startUtc, endUtc, timezone, created.joinUrl, now, now);
    id = Number(info.lastInsertRowid);
    for (const a of dedup) pin.run(id, a.email, a.name ?? null);
  });

  const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as MeetingRow;
  const { sent, failed } = await sendInvitesFor({
    db, mailer: input.mailer, hostname, meeting, organizer, attendees: dedup, kind: 'invite',
  });
  return { meeting, sentCount: sent, failedCount: failed };
}

export interface SendInvitesArgs {
  db: DB;
  mailer: { send: (a: any) => Promise<{ ok: boolean }> };
  hostname: string;
  meeting: MeetingRow;
  organizer: OrganizerInfo;
  attendees: AttendeeInput[];
  kind: EmailKind;
}

export async function sendInvitesFor(args: SendInvitesArgs): Promise<{ sent: number; failed: number }> {
  let sent = 0, failed = 0;
  for (const a of args.attendees) {
    const ics = generateIcs({
      id: args.meeting.id, title: args.meeting.title, description: args.meeting.description,
      organizer: { name: args.organizer.name, email: args.organizer.email },
      startUtc: args.meeting.start_utc, endUtc: args.meeting.end_utc, timezone: args.meeting.timezone,
      joinUrl: args.meeting.join_url, sequence: args.meeting.sequence,
      participants: args.attendees.filter((x) => x.email.toLowerCase() !== a.email.toLowerCase()),
      hostname: args.hostname,
    }, args.kind === 'cancel' ? 'CANCEL' : 'REQUEST');
    const subject = args.kind === 'invite' ? `Invitation: ${args.meeting.title}`
                  : args.kind === 'update' ? `Updated: ${args.meeting.title}`
                  : `Cancelled: ${args.meeting.title}`;
    const text = `${args.meeting.title}\n${args.meeting.start_utc} to ${args.meeting.end_utc}\nJoin: ${args.meeting.join_url}`;
    const html = `<p><strong>${escapeHtml(args.meeting.title)}</strong></p><p>Join: <a href="${args.meeting.join_url}">${args.meeting.join_url}</a></p>`;
    const r = await args.mailer.send({
      db: args.db, meetingId: args.meeting.id, to: a.email, subject, text, html,
      ics, icsFilename: args.kind === 'cancel' ? 'cancel.ics' : 'invite.ics', kind: args.kind,
    });
    if (r.ok) sent++; else failed++;
  }
  return { sent, failed };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
