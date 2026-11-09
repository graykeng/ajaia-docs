import { DatabaseSync } from "node:sqlite";
import { setDbForTests, type Db, type Statement } from "@/lib/db";

/**
 * An in-memory SQLite database behind the app's `Db` interface. Production
 * uses Cloudflare D1, which is also SQLite, so the same SQL runs in both.
 */
export function createTestDb(): Db {
  const sqlite = new DatabaseSync(":memory:");
  const run = (s: string | Statement) => {
    const { sql, args = [] } = typeof s === "string" ? { sql: s } : s;
    const stmt = sqlite.prepare(sql);
    if (/^\s*(select|with)\b/i.test(sql)) {
      return { rows: stmt.all(...args) as Record<string, unknown>[], rowsAffected: 0 };
    }
    return { rows: [], rowsAffected: Number(stmt.run(...args).changes) };
  };
  return {
    execute: async (s) => run(s),
    batch: async (stmts) => {
      sqlite.exec("BEGIN");
      try {
        stmts.forEach(run);
        sqlite.exec("COMMIT");
      } catch (e) {
        sqlite.exec("ROLLBACK");
        throw e;
      }
    },
  };
}

/** Gives each test file a fresh, seeded database (Alice, Bob, Carol + welcome doc). */
export async function useFreshDb(): Promise<void> {
  await setDbForTests(createTestDb());
}
