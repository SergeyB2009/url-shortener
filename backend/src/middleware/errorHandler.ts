import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string) {
    super(400, message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(message: string = 'Not found') {
    super(404, message);
    this.name = 'NotFoundError';
  }
}

export const notFoundHandler = (
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  res.status(404).json({ error: 'Not found' });
};

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  console.error('[Error]', err.name, err.message);

  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }

  if (err.name === 'ZodError') {
    res.status(400).json({ error: 'Validation failed', details: err.message });
    return;
  }

  res.status(500).json({ error: 'Internal server error' });
};