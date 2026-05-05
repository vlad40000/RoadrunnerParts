import "server-only";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

let dbInstance: ReturnType<typeof drizzle> | null = null;
let sqlInstance: ReturnType<typeof neon> | null = null;

function getSql() {
  if (!sqlInstance) {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error("Missing DATABASE_URL");
    }
    sqlInstance = neon(databaseUrl);
  }
  return sqlInstance;
}

function getDb() {
  if (!dbInstance) {
    dbInstance = drizzle(getSql());
  }
  return dbInstance;
}

const sqlProxyTarget = ((strings: TemplateStringsArray, ...values: unknown[]) => {
  return (getSql() as any)(strings, ...values);
}) as ReturnType<typeof neon>;

export const sql = new Proxy(sqlProxyTarget, {
  apply(_target, thisArg, argArray) {
    return (getSql() as any).apply(thisArg, argArray);
  },
  get(_target, prop, receiver) {
    return Reflect.get(getSql() as object, prop, receiver);
  },
});

export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    return Reflect.get(getDb() as object, prop, receiver);
  },
});
