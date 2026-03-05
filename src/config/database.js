const config = require('./index');

/**
 * Returns MySQL pool config if DB credentials are present.
 * Used to optionally enable DB when configured.
 */
function getPoolConfig() {
  const { host, port, user, password, database } = config.db;
  if (!host || !user || !database) {
    return null;
  }
  return {
    host,
    port,
    user,
    password,
    database,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
  };
}

module.exports = { getPoolConfig };
