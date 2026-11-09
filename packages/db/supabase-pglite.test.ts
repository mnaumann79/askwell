import { describe, expect, it } from "vitest";
import { closeTestDb, createTestDb, query } from "./supabase-pglite";

describe("pglite test database", () => {
  it("boots a Postgres and answers a query", async () => {
    const db = await createTestDb();

    try {
      const rows = await query<{ answer: number }>(db, "select 1 as answer");

      expect(rows).toHaveLength(1);
      expect(rows[0]?.answer).toBe(1);
    } finally {
      await closeTestDb(db);
    }
  });

  it("runs a query with parameters", async () => {
    const db = await createTestDb();

    try {
      const rows = await query<{ greeting: string }>(db, "select $1::text as greeting", ["hello"]);

      expect(rows[0]?.greeting).toBe("hello");
    } finally {
      await closeTestDb(db);
    }
  });
});
