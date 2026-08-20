import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

// Single shared pool. Hostinger caps concurrent connections per MySQL user, so
// keep connectionLimit small. `timezone: "Z"` keeps every DATETIME in UTC —
// display conversion to America/Asuncion happens in the formatting layer.
const globalForDb = globalThis as unknown as {
  facturarPool?: mysql.Pool;
};

const pool =
  globalForDb.facturarPool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL,
    connectionLimit: 8,
    timezone: "Z",
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.facturarPool = pool;
}

export const db = drizzle(pool, { schema, mode: "default" });
export { schema, pool };
