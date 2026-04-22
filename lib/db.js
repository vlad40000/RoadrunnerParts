import 'server-only';
import { neon } from '@neondatabase/serverless';

let sqlClient = null;

function getSqlClient() {
  if (!sqlClient) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Missing DATABASE_URL');
    }
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

export function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

export function sql(strings, ...values) {
  return getSqlClient()(strings, ...values);
}
