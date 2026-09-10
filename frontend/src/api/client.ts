const API_BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

export interface ShortenResponse {
  shortCode: string;
  shortUrl: string;
}

export interface StatsResponse {
  originalUrl: string;
  shortCode: string;
  clicks: number;
  createdAt: string;
}

export const shortenUrl = async (
  originalUrl: string
): Promise<ShortenResponse> => {
  const res = await fetch(`${API_BASE}/api/shorten`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ originalUrl }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to shorten URL');
  }
  return res.json();
};

export const getStats = async (
  shortCode: string
): Promise<StatsResponse> => {
  const res = await fetch(`${API_BASE}/api/stats/${shortCode}`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error ?? 'Failed to get stats');
  }
  return res.json();
};