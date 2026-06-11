/**
 * Jest globalSetup — runs once in the main process before any test worker starts.
 * Probes the test database; if unreachable, sets TEST_DB_AVAILABLE='' so that
 * integration tests can use it.runIf(process.env.TEST_DB_AVAILABLE === 'true')
 * to skip cleanly rather than fail.
 */

const { Client } = require('pg');

module.exports = async function globalSetup() {
  const connectionString =
    process.env.TEST_DATABASE_URL ||
    'postgresql://user:password@localhost:5433/travel_agent_test';

  const client = new Client({ connectionString, connectionTimeoutMillis: 2000 });
  try {
    await client.connect();
    await client.end();
    process.env.TEST_DB_AVAILABLE = 'true';
  } catch {
    process.env.TEST_DB_AVAILABLE = '';
    console.warn(
      '\n⚠️  Test DB not available at ' + connectionString + '\n' +
      '   Integration tests will be skipped.\n' +
      '   Start the test DB, then run: npm run test:integration\n',
    );
  }
};
