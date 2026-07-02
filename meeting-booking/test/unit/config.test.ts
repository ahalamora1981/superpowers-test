import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      APP_HOSTNAME: 'meet.example.com',
      NODE_ENV: 'production',
      PORT: '4000',
      HTTPS: 'true',
      SESSION_SECRET: 's'.repeat(32),
      DATABASE_PATH: './data/app.db',
      SESSIONS_DATABASE_PATH: './data/sessions.db',
      SMTP_HOST: 'smtp.example.com',
      SMTP_PORT: '587',
      SMTP_SECURE: 'false',
      SMTP_USER: 'u',
      SMTP_PASS: 'p',
      SMTP_FROM: 'Meetings <m@example.com>',
      VIDEO_PROVIDER: 'fake',
      CALENDAR_START_HOUR: '8',
      CALENDAR_END_HOUR: '20',
      DEFAULT_TIMEZONE: 'UTC',
    };
    vi.resetModules();
  });

  afterEach(() => { process.env = originalEnv; });

  it('loads a complete env', async () => {
    const { loadConfig } = await import('../../src/config.js');
    const cfg = loadConfig();
    expect(cfg.port).toBe(4000);
    expect(cfg.https).toBe(true);
    expect(cfg.calendarStartHour).toBe(8);
    expect(cfg.videoProvider).toBe('fake');
  });

  it('throws when SESSION_SECRET is missing', async () => {
    delete process.env.SESSION_SECRET;
    const { loadConfig } = await import('../../src/config.js');
    expect(() => loadConfig()).toThrow(/SESSION_SECRET/);
  });

  it('throws when CALENDAR_END_HOUR <= CALENDAR_START_HOUR', async () => {
    process.env.CALENDAR_START_HOUR = '20';
    process.env.CALENDAR_END_HOUR = '8';
    const { loadConfig } = await import('../../src/config.js');
    expect(() => loadConfig()).toThrow(/CALENDAR_END_HOUR/);
  });
});
