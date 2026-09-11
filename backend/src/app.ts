import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import {
  shorten,
  redirect,
  stats,
  deleteUrl,
} from './controllers/urlController';
import { validateBody, validateParams } from './middleware/validate';
import { shortenSchema, statsSchema } from './validators/urlValidator';
import { notFoundHandler, errorHandler } from './middleware/errorHandler';

export const createApp = (): express.Express => {
  const app = express();

  app.use(cors());
  app.use(express.json());
  app.use(morgan('dev'));

  app.post('/api/shorten', validateBody(shortenSchema), shorten);
  app.get('/api/stats/:shortCode', validateParams(statsSchema), stats);
  app.delete('/api/urls/:shortCode', validateParams(statsSchema), deleteUrl);

  // Редирект — последним, чтобы не перехватывать /api/*
  app.get('/:shortCode', redirect);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
};