import express from 'express';
import type { Config } from './config.js';

export function createApp(_config: Config) {
  const app = express();
  app.get('/healthz', (_req, res) => res.json({ ok: true }));
  return app;
}
