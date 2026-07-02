import nodemailer, { type Transporter } from 'nodemailer';
import type { DB } from '../db.js';

export interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
  from: string;
}

export type EmailKind = 'invite' | 'update' | 'cancel';

export interface SendArgs {
  db: DB;
  meetingId: number;
  to: string;
  subject: string;
  text: string;
  html: string;
  ics: string;
  icsFilename: string;
  kind: EmailKind;
}

export function createMailer(cfg: EmailConfig, transport?: Transporter) {
  const tx = transport ?? nodemailer.createTransport({
    host: cfg.host, port: cfg.port, secure: cfg.secure,
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined,
  });

  return {
    async send(args: SendArgs): Promise<{ ok: boolean; error?: string }> {
      try {
        await tx.sendMail({
          from: cfg.from,
          to: args.to,
          subject: args.subject,
          text: args.text,
          html: args.html,
          attachments: [{ filename: args.icsFilename, content: args.ics, contentType: 'text/calendar; method=REQUEST; charset=UTF-8' }],
        });
        args.db.prepare(`INSERT INTO email_send_log (meeting_id, recipient, kind, status, sent_at)
                         VALUES (?, ?, ?, 'sent', ?)`)
          .run(args.meetingId, args.to, args.kind, new Date().toISOString());
        return { ok: true };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        args.db.prepare(`INSERT INTO email_send_log (meeting_id, recipient, kind, status, error, sent_at)
                         VALUES (?, ?, ?, 'failed', ?, ?)`)
          .run(args.meetingId, args.to, args.kind, msg, new Date().toISOString());
        return { ok: false, error: msg };
      }
    },
    close: () => tx.close(),
  };
}
