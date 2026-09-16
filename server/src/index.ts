import { buildApp } from './app.ts';
import { env } from './config/env.ts';
import { close } from './db/pool.ts';
import { migrate } from './db/migrate.ts';

async function main(): Promise<void> {
  // Migrate before listening. A process that serves traffic against a schema it
  // has not applied yet fails in ways that look like data corruption.
  await migrate();

  const app = await buildApp();
  await app.listen({ port: env.PORT, host: env.HOST });

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'shutting down');
    // Close the server first so in-flight requests finish before the pool goes.
    await app.close();
    await close();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error) => {
  console.error('[server] failed to start', error);
  process.exit(1);
});
