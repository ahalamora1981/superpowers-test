import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';
import { weekStartMonday, addDays } from '../lib/time.js';
import { loadConfig } from '../config.js';

export function calendarRoutes(db: DB) {
  const r = Router();
  const cfg = loadConfig();

  function parseWeek(s: string | undefined): Date {
    if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) throw new Error('Invalid week');
    const d = new Date(s + 'T00:00:00Z');
    if (isNaN(d.getTime())) throw new Error('Invalid week');
    return weekStartMonday(d);
  }

  r.get('/', requireAuth, (req, res) => {
    let week: Date;
    try { week = parseWeek(req.query.week as string); }
    catch { week = weekStartMonday(new Date()); }
    const user = db.prepare('SELECT id, role, display_name, timezone FROM users WHERE id = ?').get(req.session.userId);
    res.render('calendar', { title: 'Calendar', week, user });
  });

  r.get('/calendar', requireAuth, (req, res) => {
    let week: Date;
    try { week = parseWeek(req.query.week as string); }
    catch { return res.status(400).send('Invalid week'); }
    const weekEnd = addDays(week, 7);
    const meetings = db.prepare(`SELECT m.*, u.display_name as organizer_name
                                FROM meetings m JOIN users u ON u.id = m.organizer_id
                                WHERE m.status = 'scheduled'
                                  AND m.start_utc < ?
                                  AND m.end_utc > ?`)
      .all(weekEnd.toISOString(), week.toISOString()) as any[];
    res.render('calendarGrid', { week, meetings, startHour: cfg.calendarStartHour, endHour: cfg.calendarEndHour });
  });

  return r;
}
