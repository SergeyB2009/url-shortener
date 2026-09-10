import { useState } from 'react';
import { getStats, StatsResponse } from '../api/client';

export const StatsForm = (): JSX.Element => {
  const [code, setCode] = useState('');
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setError(null);
    setStats(null);
    setLoading(true);
    try {
      const data = await getStats(code.trim());
      setStats(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card">
      <h2>Статистика</h2>
      <form onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="abc123"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Загружаем...' : 'Получить статистику'}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      {stats && (
        <dl className="stats">
          <dt>Оригинальный URL</dt>
          <dd>
            <a href={stats.originalUrl} target="_blank" rel="noreferrer">
              {stats.originalUrl}
            </a>
          </dd>
          <dt>Количество переходов</dt>
          <dd>{stats.clicks}</dd>
          <dt>Дата создания</dt>
          <dd>{new Date(stats.createdAt).toLocaleString()}</dd>
        </dl>
      )}
    </section>
  );
};