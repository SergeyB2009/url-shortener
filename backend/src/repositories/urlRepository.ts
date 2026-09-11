import { pool } from '../db/pool';

export interface UrlRecord {
  id: number;
  short_code: string;
  original_url: string;
  clicks: number;
  created_at: Date;
}

export const findByShortCode = async (
  shortCode: string
): Promise<UrlRecord | null> => {
  const { rows } = await pool.query<UrlRecord>(
    'SELECT * FROM urls WHERE short_code = $1',
    [shortCode]
  );
  return rows[0] ?? null;
};

export const insertUrl = async (
  shortCode: string,
  originalUrl: string
): Promise<UrlRecord> => {
  const { rows } = await pool.query<UrlRecord>(
    `INSERT INTO urls (short_code, original_url)
     VALUES ($1, $2)
     RETURNING *`,
    [shortCode, originalUrl]
  );
  return rows[0];
};

export const incrementClicks = async (shortCode: string): Promise<void> => {
  await pool.query(
    'UPDATE urls SET clicks = clicks + 1 WHERE short_code = $1',
    [shortCode]
  );
};

export const incrementClicksBy = async (
  shortCode: string,
  amount: number
): Promise<void> => {
  await pool.query(
    'UPDATE urls SET clicks = clicks + $1 WHERE short_code = $2',
    [amount, shortCode]
  );
};

export const deleteByShortCode = async (
  shortCode: string
): Promise<boolean> => {
  const result = await pool.query(
    'DELETE FROM urls WHERE short_code = $1',
    [shortCode]
  );
  return (result.rowCount ?? 0) > 0;
};