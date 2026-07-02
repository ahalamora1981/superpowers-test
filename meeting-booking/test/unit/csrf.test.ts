import { describe, it, expect } from 'vitest';
import express from 'express';
import session from 'express-session';
import request from 'supertest';
import { csrfProtection, getCsrfToken } from '../../src/middleware/csrf.js';

function makeApp() {
  const app = express();
  app.use(session({ secret: 'test-secret-very-long-string-1234', resave: false, saveUninitialized: true }));
  app.use(express.urlencoded({ extended: false }));
  app.use(csrfProtection);
  app.get('/form', (req, res) => res.send(`<form><input name="_csrf" value="${getCsrfToken(req)}"></form>`));
  app.post('/submit', (req, res) => res.send('ok'));
  return app;
}

describe('csrf', () => {
  it('issues a token on GET', async () => {
    const res = await request(makeApp()).get('/form');
    expect(res.text).toMatch(/name="_csrf" value="[^"]+"/);
  });

  it('rejects POST without a token', async () => {
    const agent = request.agent(makeApp());
    await agent.get('/form');
    const res = await agent.post('/submit');
    expect(res.status).toBe(403);
  });

  it('accepts POST with a valid token', async () => {
    const agent = request.agent(makeApp());
    const get = await agent.get('/form');
    const m = get.text.match(/name="_csrf" value="([^"]+)"/);
    const token = m![1];
    const res = await agent.post('/submit').type('form').send({ _csrf: token });
    expect(res.status).toBe(200);
  });
});
