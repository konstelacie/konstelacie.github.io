require('dotenv').config();

const config = require('./src/config');
const db = require('./src/db');
const app = require('./src/app');

const server = app.listen(config.port, () => {
  console.log(`Server running at http://localhost:${config.port}`);
});

async function shutdown() {
  console.log('Shutting down...');
  server.close();
  await db.close();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
