import nodemailer, { type Transporter } from 'nodemailer';

export interface CapturedMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; content: string | Buffer }[];
}

export function createFakeSmtp() {
  const messages: CapturedMessage[] = [];
  const transport = nodemailer.createTransport({
    streamTransport: true,
    buffer: true,
    newline: 'unix',
    rateLimit: false,
  });
  const orig = transport.sendMail.bind(transport);
  (transport as any).sendMail = (async (opts: any) => {
    const msg: CapturedMessage = {
      to: (opts.to ?? '').toString(),
      from: (opts.from ?? '').toString(),
      subject: opts.subject ?? '',
      text: opts.text ?? '',
      html: opts.html ?? '',
      attachments: (opts.attachments ?? []).map((a: any) => ({ filename: a.filename, content: a.content })),
    };
    messages.push(msg);
    return { messageId: 'fake', envelope: { from: msg.from, to: [msg.to] }, accepted: [msg.to], rejected: [] };
  }) as any;
  return { transport, messages, verify: async () => true };
}
