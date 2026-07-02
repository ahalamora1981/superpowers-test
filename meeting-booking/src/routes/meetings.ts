import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { canModifyMeeting } from '../middleware/canModifyMeeting.js';
import { findOrganizerConflict } from '../lib/conflict.js';
import { createMeeting, updateMeeting, cancelMeeting } from '../lib/meetings.js';
import { localToUtc } from '../lib/time.js';
import { getVideoProvider } from '../lib/video/index.js';
import { createMailer } from '../lib/email.js';
import { loadConfig } from '../config.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseAttendees(raw: string): string[] {
  return Array.from(new Set(
    raw.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter((s) => s && EMAIL_RE.test(s))
  ));
}

function getOrganizer(db: DB, userId: number) {
  const row = db.prepare('SELECT id, display_name as name, email, timezone FROM users WHERE id = ?').get(userId) as any;
  if (!row) throw new Error('Organizer not found');
  return row;
}

export function meetingRoutes(db: DB) {
  const r = Router();
  const cfg = loadConfig();
  const video = getVideoProvider({ kind: cfg.videoProvider, hostname: cfg.appHostname });
  const mailer = createMailer({
    host: cfg.smtpHost, port: cfg.smtpPort, secure: cfg.smtpSecure,
    user: cfg.smtpUser, pass: cfg.smtpPass, from: cfg.smtpFrom,
  });

  r.get('/meetings/new', requireAuth, (req, res) => {
    const start = (req.query.start as string) || '';
    res.render('meetings/form', { title: 'New meeting', meeting: null, defaultStart: start, user: getOrganizer(db, req.session.userId!), error: null, conflict: null });
  });

  r.post('/meetings', requireAuth, async (req, res, next) => {
    try {
      const { title, description, start, end, attendees } = req.body as Record<string, string>;
      const override = req.query.override === '1' || req.body.override === '1';
      const trimmedTitle = (title ?? '').trim();
      if (!trimmedTitle || trimmedTitle.length > 200) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Title is required (1–200 chars)', user: getOrganizer(db, req.session.userId!), conflict: null });
      }
      if ((description ?? '').length > 5000) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Description is too long', user: getOrganizer(db, req.session.userId!), conflict: null });
      }
      if (!start || !end) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Start and end are required', user: getOrganizer(db, req.session.userId!), conflict: null });
      }
      const user = getOrganizer(db, req.session.userId!);
      let startUtc: string, endUtc: string;
      try {
        startUtc = localToUtc(start, user.timezone);
        endUtc = localToUtc(end, user.timezone);
      } catch {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Invalid date/time', user, conflict: null });
      }
      if (new Date(endUtc) <= new Date(startUtc)) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'End must be after start', user, conflict: null });
      }
      if (new Date(endUtc).getTime() - new Date(startUtc).getTime() > 8 * 60 * 60 * 1000) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Meetings cannot exceed 8 hours', user, conflict: null });
      }
      if (new Date(endUtc) <= new Date()) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'Cannot create a meeting in the past', user, conflict: null });
      }
      const attendeeEmails = parseAttendees(attendees ?? '');
      if (attendeeEmails.length === 0) {
        return res.status(400).render('meetings/form', { title: 'New meeting', meeting: null, error: 'At least one attendee is required', user, conflict: null });
      }
      const conflict = findOrganizerConflict(db, user.id, startUtc, endUtc);
      if (conflict && !override) {
        return res.status(409).render('meetings/form', { title: 'New meeting', meeting: null, error: null, conflict, user });
      }
      const { meeting, failedCount } = await createMeeting({
        db, mailer, video, hostname: cfg.appHostname, organizer: user,
        title: trimmedTitle, description: (description ?? '').trim() || null,
        startUtc, endUtc, timezone: user.timezone,
        attendees: attendeeEmails.map((e) => ({ email: e })),
      });
      const flash = failedCount > 0 ? `?flash=${encodeURIComponent(`${failedCount} invitations failed`)}` : '';
      res.redirect(`/meetings/${meeting.id}${flash}`);
    } catch (err) { next(err); }
  });

  r.get('/meetings/:id', requireAuth, (req, res) => {
    const id = Number(req.params.id);
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
    if (!meeting) return res.status(404).send('Meeting not found');
    const parts = db.prepare('SELECT email, name FROM participants WHERE meeting_id = ? ORDER BY email').all(id) as any[];
    const organizer = db.prepare('SELECT id, display_name, email, timezone FROM users WHERE id = ?').get(meeting.organizer_id) as any;
    const user = getOrganizer(db, req.session.userId!);
    const canModify = user.id === meeting.organizer_id || user.role === 'admin';
    const flash = (req.query.flash as string) || null;
    res.render('meetings/details', { title: meeting.title, meeting, parts, organizer, canModify, flash, user });
  });

  r.get('/meetings/:id/edit', requireAuth, canModifyMeeting(db), (req, res) => {
    const id = Number(req.params.id);
    const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
    if (!meeting) return res.status(404).send('Meeting not found');
    const parts = db.prepare('SELECT email FROM participants WHERE meeting_id = ? ORDER BY email').all(id) as any[];
    meeting.attendees_text = parts.map((p: any) => p.email).filter((e: string) => e !== db.prepare('SELECT email FROM users WHERE id = ?').get(meeting.organizer_id)).map((e: any) => e).join('\n');
    meeting.start_local = new Date(meeting.start_utc).toISOString().slice(0, 16);
    meeting.end_local = new Date(meeting.end_utc).toISOString().slice(0, 16);
    res.render('meetings/form', { title: 'Edit meeting', meeting, user: getOrganizer(db, req.session.userId!), error: null, conflict: null });
  });

  r.post('/meetings/:id', requireAuth, canModifyMeeting(db), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const existing = db.prepare('SELECT id FROM meetings WHERE id = ?').get(id);
      if (!existing) return res.status(404).send('Meeting not found');
      const { title, description, start, end, attendees } = req.body as Record<string, string>;
      const user = getOrganizer(db, req.session.userId!);
      const trimmedTitle = (title ?? '').trim();
      if (!trimmedTitle || trimmedTitle.length > 200) {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(400).render('meetings/form', { title: 'Edit meeting', meeting, error: 'Title is required (1–200 chars)', user, conflict: null });
      }
      let startUtc: string, endUtc: string;
      try {
        startUtc = localToUtc(start, user.timezone);
        endUtc = localToUtc(end, user.timezone);
      } catch {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(400).render('meetings/form', { title: 'Edit meeting', meeting, error: 'Invalid date/time', user, conflict: null });
      }
      if (new Date(endUtc) <= new Date(startUtc)) {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(400).render('meetings/form', { title: 'Edit meeting', meeting, error: 'End must be after start', user, conflict: null });
      }
      if (new Date(endUtc) <= new Date()) {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(400).render('meetings/form', { title: 'Edit meeting', meeting, error: 'Cannot schedule a meeting in the past', user, conflict: null });
      }
      const attendeeEmails = parseAttendees(attendees ?? '');
      if (attendeeEmails.length === 0) {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(400).render('meetings/form', { title: 'Edit meeting', meeting, error: 'At least one attendee is required', user, conflict: null });
      }
      const override = req.query.override === '1';
      const conflict = findOrganizerConflict(db, user.id, startUtc, endUtc, id);
      if (conflict && !override) {
        const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
        return res.status(409).render('meetings/form', { title: 'Edit meeting', meeting, error: null, conflict, user });
      }
      const { failedCount } = await updateMeeting({
        db, mailer, video, hostname: cfg.appHostname, meetingId: id, organizer: user,
        title: trimmedTitle, description: (description ?? '').trim() || null,
        startUtc, endUtc, timezone: user.timezone,
        attendees: attendeeEmails.map((e) => ({ email: e })),
      });
      const flash = failedCount > 0 ? `?flash=${encodeURIComponent(`${failedCount} invitations failed`)}` : '';
      res.redirect(`/meetings/${id}${flash}`);
    } catch (err) { next(err); }
  });

  r.post('/meetings/:id/cancel', requireAuth, canModifyMeeting(db), async (req, res, next) => {
    try {
      const id = Number(req.params.id);
      const meeting = db.prepare('SELECT * FROM meetings WHERE id = ?').get(id) as any;
      if (!meeting) return res.status(404).send('Meeting not found');
      const user = getOrganizer(db, req.session.userId!);
      const parts = db.prepare('SELECT email, name FROM participants WHERE meeting_id = ?').all(id) as any[];
      await cancelMeeting({ db, mailer, hostname: cfg.appHostname, meeting, organizer: user, attendees: parts.map((p) => ({ email: p.email, name: p.name })) });
      res.redirect(`/meetings/${id}`);
    } catch (err) { next(err); }
  });

  return r;
}
