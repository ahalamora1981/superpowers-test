import { Router } from 'express';
import type { DB } from '../db.js';
import { requireAuth } from '../middleware/requireAuth.js';

export function myMeetingsRoutes(db: DB) {
  const r = Router();
  r.get('/my-meetings', requireAuth, (req, res) => {
    const now = new Date().toISOString();
    const upcoming = db.prepare(`SELECT * FROM meetings WHERE organizer_id = ? AND status = 'scheduled' AND end_utc > ?
                                 ORDER BY start_utc ASC`).all(req.session.userId, now);
    const past = db.prepare(`SELECT * FROM meetings WHERE organizer_id = ? AND (status = 'cancelled' OR end_utc <= ?)
                             ORDER BY start_utc DESC LIMIT 50`).all(req.session.userId, now);
    res.render('myMeetings', { title: 'My meetings', upcoming, past });
  });
  return r;
}
