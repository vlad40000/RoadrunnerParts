import 'server-only';
import { neon } from '@neondatabase/serverless';

let sqlClient: any = null;

function getSqlClient() {
  if (!sqlClient) {
    const databaseUrl = process.env.NEON_DATABASE_URL || process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('Missing DATABASE_URL');
    }
    sqlClient = neon(databaseUrl);
  }
  return sqlClient;
}

export function hasDatabase() {
  return Boolean(process.env.NEON_DATABASE_URL || process.env.DATABASE_URL);
}

/**
 * Neon SQL Template Literal
 * Usage: await sql`SELECT * FROM users WHERE id = ${id}`
 */
export async function sql(strings: TemplateStringsArray, ...values: any[]) {
  const client = getSqlClient();
  return client(strings, ...values);
}
