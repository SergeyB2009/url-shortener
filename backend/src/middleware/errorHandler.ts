import { Request, Response, NextFunction } from 'express';

export const notFoundHandler = (
  _req: Request,
  res: Response
): void => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Error]', err.message);
  res.status(500).json({ error: 'Internal server error' });
};