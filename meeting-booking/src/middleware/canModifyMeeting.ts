import type { Request, Response, NextFunction } from 'express';
import type { DB } from '../../db.js';

export function canModifyMeeting(db: DB) {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(404).send('Meeting not found');
    const meeting = db.prepare('SELECT id, organizer_id, status FROM meetings WHERE id = ?').get(id) as
      { id: number; organizer_id: number; status: string } | undefined;
    if (!meeting) return res.status(404).send('Meeting not found');
    if (meeting.status === 'cancelled') {
      return res.status(400).send('Cannot modify a cancelled meeting');
    }
    const userId = req.session.userId!;
    const user = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
    if (!user) return res.redirect('/logout');
    if (meeting.organizer_id !== userId && user.role !== 'admin') {
      return res.status(403).send('Only the organizer or an admin can modify this meeting');
    }
    next();
  };
}
