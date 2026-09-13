import { createApp } from './app';
import { config } from './config';
import { initDb } from './db/pool';
import { flushClicksToDb } from './services/urlService';

const FLUSH_INTERVAL_MS = 30_000;

const bootstrap = async (): Promise<void> => {
  await initDb();
  const app = createApp();

  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });

  // В тестах flush запускается вручную, чтобы не влиять на изоляцию.
  if (config.nodeEnv !== 'test') {
    setInterval(() => {
      flushClicksToDb().catch((err) =>
        console.error('[Flush] error:', err.message)
      );
    }, FLUSH_INTERVAL_MS);
  }
};

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});