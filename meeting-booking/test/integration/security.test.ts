import { describe, it, expect, beforeAll } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { loadConfig } from '../../src/config.js';
import { openDb, runMigrations } from '../../src/db.js';

function makeEnv() {
  process.env.APP_HOSTNAME = 'meet.local';
  process.env.SMTP_HOST = 'localhost';
  process.env.SMTP_PORT = '1025';
  process.env.SMTP_FROM = 'a@b.c';
  process.env.SESSION_SECRET = 'x'.repeat(32);
}

describe('security + health + errors', () => {
  it('GET /healthz returns 200 and reports db up', () => {
    makeEnv();
    const db = openDb(':memory:');
    runMigrations(db);
    const app = createApp(loadConfig(), { db });
    return request(app).get('/healthz').then((res) => {
      expect(res.status).toBe(200);
      expect(res.body).toEqual({ ok: true, db: 'up' });
    });
  });

  it('GET /healthz reports db down when DB is bad', () => {
    makeEnv();
    const db = openDb(':memory:');
    runMigrations(db);
    db.close();
    const app = createApp(loadConfig(), { db, autoMigrate: false });
    return request(app).get('/healthz').then((res) => {
      expect(res.status).toBe(503);
      expect(res.body.db).toBe('down');
    });
  });

  it('responds with X-Content-Type-Options: nosniff (helmet)', () => {
    makeEnv();
    const db = openDb(':memory:');
    runMigrations(db);
    const app = createApp(loadConfig(), { db });
    return request(app).get('/healthz').then((res) => {
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  it('unknown route renders 404 when users exist', () => {
    makeEnv();
    const db = openDb(':memory:');
    runMigrations(db);
    db.prepare(`INSERT INTO users (username, password_hash, role, timezone, display_name, email, created_at)
                VALUES ('u', 'h', 'admin', 'UTC', 'U', 'u@x.com', ?)`).run(new Date().toISOString());
    const app = createApp(loadConfig(), { db, autoMigrate: false });
    return request(app).get('/this/does/not/exist').then((res) => {
      expect(res.status).toBe(404);
    });
  });
});
