import type { StatusResponse } from "@/contracts/status";
import { databasePool } from "@/db/client";

export const readStatus = async (): Promise<StatusResponse> => {
  const checkedAt = new Date().toISOString();

  try {
    await databasePool.query("select 1");
    return {
      status: "ok",
      services: { application: "ok", database: "ok" },
      checkedAt,
    };
  } catch (error) {
    console.error("PostgreSQL health check failed", error);
    return {
      status: "degraded",
      services: { application: "ok", database: "error" },
      checkedAt,
    };
  }
};
