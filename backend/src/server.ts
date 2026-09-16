import { createApp } from './app';
import { config } from './config';
import { initDb, pool } from './db/pool';
import { flushClicksToDb } from './services/urlService';
import { redis } from './cache/redisClient';

const FLUSH_INTERVAL_MS = 30_000;

const bootstrap = async (): Promise<void> => {
  await initDb();
  const app = createApp();

  const server = app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });

  // В тестах flush запускается вручную, чтобы не влиять на изоляцию.
  let flushTimer: NodeJS.Timeout | null = null;
  if (config.nodeEnv !== 'test') {
    flushTimer = setInterval(() => {
      flushClicksToDb().catch((err) =>
        console.error('[Flush] error:', err.message)
      );
    }, FLUSH_INTERVAL_MS);
  }

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`\n[Shutdown] Received ${signal}, closing gracefully...`);

    if (flushTimer) {
      clearInterval(flushTimer);
      flushTimer = null;
    }

    server.close(async () => {
      try {
        // Последний flush, чтобы не потерять буфер
        await flushClicksToDb();
        await pool.end();
        await redis.quit();
        console.log('[Shutdown] Done');
        process.exit(0);
      } catch (err) {
        console.error('[Shutdown] Error:', err);
        process.exit(1);
      }
    });
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
};

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});