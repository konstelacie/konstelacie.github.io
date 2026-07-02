require('dotenv').config();

const config = require('./src/config');
const db = require('./src/db');
const app = require('./src/app');
const capiHealthService = require('./src/services/capiHealthService');

const server = app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
  void capiHealthService.checkCapiConfigAtStartup().catch((err) => {
    console.error('[startup] capi config check failed', err);
  });
});

async function shutdown() {
  console.log('Shutting down...');
  server.close();
  await db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
