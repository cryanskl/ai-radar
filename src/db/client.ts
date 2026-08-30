import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { getDatabaseEnv } from "@/config/server-env";

export const databasePool = new Pool({
  connectionString: getDatabaseEnv().DATABASE_URL,
});

export const database = drizzle(databasePool);
