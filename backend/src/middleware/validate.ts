import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

export const validateBody =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map((e) => e.message),
      });
      return;
    }
    req.body = result.data;
    next();
  };

export const validateParams =
  (schema: ZodSchema) =>
  (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.params);
    if (!result.success) {
      res.status(400).json({
        error: 'Validation failed',
        details: result.error.errors.map((e) => e.message),
      });
      return;
    }
    // ВАЖНО: перезаписываем req.params распарсенными данными,
    // чтобы контроллер работал с уже валидированными значениями
    req.params = result.data as Record<string, string>;
    next();
  };