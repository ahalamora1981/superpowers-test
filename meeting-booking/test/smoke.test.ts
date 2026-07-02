import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { loadConfig } from '../src/config.js';

describe('smoke', () => {
  it('GET /healthz returns 200', async () => {
    process.env.SESSION_SECRET ??= 'x'.repeat(32);
    process.env.APP_HOSTNAME ??= 'meet.local';
    process.env.SMTP_HOST ??= 'localhost';
    process.env.SMTP_PORT ??= '1025';
    process.env.SMTP_FROM ??= 'a@b.c';
    const cfg = loadConfig();
    const app = createApp(cfg, { db: undefined, autoMigrate: false });
    // We need an open DB for /healthz; use a temp one.
    const { openDb } = await import('../src/db.js');
    const db = openDb(':memory:');
    const { createApp: freshCreate } = await import('../src/app.js');
    const res = await request(freshCreate(cfg, { db, autoMigrate: false })).get('/healthz');
    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
  });
});
