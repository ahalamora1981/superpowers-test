import 'dotenv/config';
import { z } from 'zod';

const Schema = z.object({
  APP_HOSTNAME: z.string().min(1),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HTTPS: z.enum(['true', 'false']).transform((v) => v === 'true').default('false' as const),
  SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 chars'),

  DATABASE_PATH: z.string().min(1).default('./data/app.db'),
  SESSIONS_DATABASE_PATH: z.string().min(1).default('./data/sessions.db'),

  SMTP_HOST: z.string().min(1),
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_SECURE: z.enum(['true', 'false']).transform((v) => v === 'true').default('false' as const),
  SMTP_USER: z.string().default(''),
  SMTP_PASS: z.string().default(''),
  SMTP_FROM: z.string().min(1),

  VIDEO_PROVIDER: z.enum(['fake', 'zoom', 'google']).default('fake'),

  CALENDAR_START_HOUR: z.coerce.number().int().min(0).max(23).default(7),
  CALENDAR_END_HOUR: z.coerce.number().int().min(1).max(24).default(21),
  DEFAULT_TIMEZONE: z.string().min(1).default('UTC'),
}).refine(
  (c) => c.CALENDAR_END_HOUR > c.CALENDAR_START_HOUR,
  { message: 'CALENDAR_END_HOUR must be greater than CALENDAR_START_HOUR' }
);

export type Config = {
  appHostname: string;
  nodeEnv: 'development' | 'production' | 'test';
  port: number;
  https: boolean;
  sessionSecret: string;
  databasePath: string;
  sessionsDatabasePath: string;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPass: string;
  smtpFrom: string;
  videoProvider: 'fake' | 'zoom' | 'google';
  calendarStartHour: number;
  calendarEndHour: number;
  defaultTimezone: string;
};

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;
  const parsed = Schema.safeParse(process.env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid configuration:\n${issues}`);
  }
  const d = parsed.data;
  cached = {
    appHostname: d.APP_HOSTNAME,
    nodeEnv: d.NODE_ENV,
    port: d.PORT,
    https: d.HTTPS,
    sessionSecret: d.SESSION_SECRET,
    databasePath: d.DATABASE_PATH,
    sessionsDatabasePath: d.SESSIONS_DATABASE_PATH,
    smtpHost: d.SMTP_HOST,
    smtpPort: d.SMTP_PORT,
    smtpSecure: d.SMTP_SECURE,
    smtpUser: d.SMTP_USER,
    smtpPass: d.SMTP_PASS,
    smtpFrom: d.SMTP_FROM,
    videoProvider: d.VIDEO_PROVIDER,
    calendarStartHour: d.CALENDAR_START_HOUR,
    calendarEndHour: d.CALENDAR_END_HOUR,
    defaultTimezone: d.DEFAULT_TIMEZONE,
  };
  return cached;
}

export function _resetConfigForTests() { cached = null; }
