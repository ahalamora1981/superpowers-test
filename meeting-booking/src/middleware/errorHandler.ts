import type { ErrorRequestHandler, RequestHandler } from 'express';
import { randomBytes } from 'node:crypto';
import pino from 'pino';

const logger = pino();

export const notFoundHandler: RequestHandler = (_req, res, _next) => {
  res.status(404).send('Not found');
};

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const reference = `err-${new Date().toISOString().slice(0, 16)}-${randomBytes(2).toString('hex')}`;
  logger.error({ err, reference, path: req.path }, 'unhandled error');
  if (res.headersSent) return;
  res.status(500).send(`Server error (reference: ${reference})`);
};
