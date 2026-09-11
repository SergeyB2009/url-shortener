import { Request, Response, NextFunction } from 'express';
import * as urlService from '../services/urlService';

export const shorten = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { originalUrl } = req.body as { originalUrl: string };
    const result = await urlService.shortenUrl(originalUrl);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
};

export const redirect = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shortCode } = req.params;
    const originalUrl = await urlService.resolveShortCode(shortCode);
    if (!originalUrl) {
      res.status(404).json({ error: 'Short code not found' });
      return;
    }

    // Двойная защита: не редиректим на самих себя
    if (urlService.isSelfReferencing(originalUrl)) {
      res.status(400).json({ error: 'Circular redirect detected' });
      return;
    }

    res.redirect(302, originalUrl);
  } catch (err) {
    next(err);
  }
};

export const stats = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shortCode } = req.params;
    const record = await urlService.getStats(shortCode);
    if (!record) {
      res.status(404).json({ error: 'Short code not found' });
      return;
    }
    res.json({
      originalUrl: record.original_url,
      shortCode: record.short_code,
      clicks: record.clicks,
      createdAt: record.created_at,
    });
  } catch (err) {
    next(err);
  }
};

export const deleteUrl = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { shortCode } = req.params;
    const deleted = await urlService.deleteUrl(shortCode);
    if (!deleted) {
      res.status(404).json({ error: 'Short code not found' });
      return;
    }
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};