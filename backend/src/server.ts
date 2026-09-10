import { createApp } from './app';
import { config } from './config';
import { initDb } from './db/pool';

const bootstrap = async (): Promise<void> => {
  await initDb();
  const app = createApp();
  app.listen(config.port, () => {
    console.log(`Server running on port ${config.port}`);
  });
};

bootstrap().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});