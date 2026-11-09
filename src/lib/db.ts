import { getCloudflareContext } from "@opennextjs/cloudflare";

/**
 * Database access.
 *
 * The app talks to SQLite through the tiny `Db` interface below. At runtime it
 * is backed by Cloudflare D1 (a local D1 emulation under `npm run dev`, the real
 * database once deployed). Tests plug in an in-memory SQLite database via
 * `setDbForTests`, so the same SQL runs everywhere.
 *
 * The schema is created on first use (CREATE TABLE IF NOT EXISTS), so there is
 * no separate migration step for reviewers to run.
 */

export type SqlArg = string | number | null;
export interface Statement {
  sql: string;
  args?: SqlArg[];
}
export interface Db {
  execute(stmt: string | Statement): Promise<{ rows: Record<string, unknown>[]; rowsAffected: number }>;
  /** Runs all statements in one transaction. */
  batch(stmts: Array<string | Statement>): Promise<void>;
}

const toStatement = (s: string | Statement): Statement => (typeof s === "string" ? { sql: s } : s);

/** Minimal structural type for the D1 binding, to avoid depending on Workers types. */
interface D1Like {
  prepare(sql: string): D1Stmt;
  batch(stmts: D1Stmt[]): Promise<unknown>;
}
interface D1Stmt {
  bind(...args: SqlArg[]): D1Stmt;
  all(): Promise<{ results?: Record<string, unknown>[]; meta?: { changes?: number } }>;
}

function d1Adapter(d1: D1Like): Db {
  const prep = (s: string | Statement) => {
    const { sql, args = [] } = toStatement(s);
    return d1.prepare(sql).bind(...args);
  };
  return {
    async execute(stmt) {
      const res = await prep(stmt).all();
      return { rows: res.results ?? [], rowsAffected: res.meta?.changes ?? 0 };
    },
    async batch(stmts) {
      await d1.batch(stmts.map(prep));
    },
  };
}

export const SEED_USERS = [
  { id: "u_alice", name: "Alice Chen", email: "alice@ajaia.test", color: "#2563eb" },
  { id: "u_bob", name: "Bob Martinez", email: "bob@ajaia.test", color: "#059669" },
  { id: "u_carol", name: "Carol Singh", email: "carol@ajaia.test", color: "#d97706" },
] as const;

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
     id TEXT PRIMARY KEY,
     name TEXT NOT NULL,
     email TEXT NOT NULL UNIQUE,
     color TEXT NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS documents (
     id TEXT PRIMARY KEY,
     title TEXT NOT NULL,
     content TEXT NOT NULL DEFAULT '',
     owner_id TEXT NOT NULL,
     version INTEGER NOT NULL DEFAULT 1,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL,
     updated_by TEXT NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_documents_owner ON documents(owner_id)`,
  `CREATE TABLE IF NOT EXISTS shares (
     document_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     role TEXT NOT NULL CHECK (role IN ('viewer','commenter','editor')),
     created_at INTEGER NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
  `CREATE INDEX IF NOT EXISTS idx_shares_user ON shares(user_id)`,
  `CREATE TABLE IF NOT EXISTS comments (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL,
     author_id TEXT NOT NULL,
     body TEXT NOT NULL,
     quote TEXT,
     resolved INTEGER NOT NULL DEFAULT 0,
     created_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_comments_doc ON comments(document_id)`,
  `CREATE TABLE IF NOT EXISTS versions (
     id TEXT PRIMARY KEY,
     document_id TEXT NOT NULL,
     title TEXT NOT NULL,
     content TEXT NOT NULL,
     author_id TEXT NOT NULL,
     label TEXT,
     created_at INTEGER NOT NULL,
     updated_at INTEGER NOT NULL
   )`,
  `CREATE INDEX IF NOT EXISTS idx_versions_doc ON versions(document_id, updated_at)`,
  `CREATE TABLE IF NOT EXISTS presence (
     document_id TEXT NOT NULL,
     user_id TEXT NOT NULL,
     last_seen INTEGER NOT NULL,
     PRIMARY KEY (document_id, user_id)
   )`,
];

const WELCOME_HTML = `<h1>Welcome to Ajaia Docs</h1>
<p>This document is owned by <strong>Alice</strong> and shared with <strong>Bob</strong> as an editor. Carol has no access to it.</p>
<h2>Things to try</h2>
<ul>
<li>Format text with <strong>bold</strong>, <em>italic</em> and <u>underline</u>.</li>
<li>Import a <code>.txt</code>, <code>.md</code> or <code>.docx</code> file from the dashboard.</li>
<li>Open <strong>Share</strong> and give Carol viewer, commenter or editor access.</li>
<li>Switch user (top right) to see the document from the other side.</li>
</ul>
<ol>
<li>Edits save automatically.</li>
<li>History keeps restorable versions.</li>
<li>Export gives you Markdown or PDF.</li>
</ol>`;

const g = globalThis as typeof globalThis & { __ajaiaTestDb?: Db; __ajaiaDbReady?: boolean };

async function init(client: Db): Promise<void> {
  await client.batch(SCHEMA);

  // Seed only an empty database, so deleted seed data does not reappear.
  const existing = await client.execute("SELECT COUNT(*) AS n FROM users");
  if (Number(existing.rows[0].n) > 0) return;

  const now = Date.now();
  await client.batch(
    [
      ...SEED_USERS.map((u) => ({
        sql: "INSERT OR IGNORE INTO users (id, name, email, color) VALUES (?, ?, ?, ?)",
        args: [u.id, u.name, u.email, u.color],
      })),
      {
        sql: `INSERT OR IGNORE INTO documents (id, title, content, owner_id, version, created_at, updated_at, updated_by)
              VALUES ('d_welcome', 'Welcome to Ajaia Docs', ?, 'u_alice', 1, ?, ?, 'u_alice')`,
        args: [WELCOME_HTML, now, now],
      },
      {
        sql: `INSERT OR IGNORE INTO shares (document_id, user_id, role, created_at)
              VALUES ('d_welcome', 'u_bob', 'editor', ?)`,
        args: [now],
      },
      {
        sql: `INSERT OR IGNORE INTO versions (id, document_id, title, content, author_id, label, created_at, updated_at)
              VALUES ('v_welcome', 'd_welcome', 'Welcome to Ajaia Docs', ?, 'u_alice', 'Created', ?, ?)`,
        args: [WELCOME_HTML, now, now],
      },
    ],
  );
}

export async function getDb(): Promise<Db> {
  if (g.__ajaiaTestDb) return g.__ajaiaTestDb;
  const env = getCloudflareContext().env as unknown as { DB?: D1Like };
  if (!env.DB) throw new Error("D1 binding `DB` is missing. Check wrangler.jsonc.");
  const db = d1Adapter(env.DB);
  // A flag rather than a shared promise: Workers must not await I/O started by
  // another request. Concurrent cold starts may both run init; it is idempotent.
  if (!g.__ajaiaDbReady) {
    await init(db);
    g.__ajaiaDbReady = true;
  }
  return db;
}

/** Test hook: swap in a different database (schema and seed are applied to it). */
export async function setDbForTests(db: Db): Promise<void> {
  await init(db);
  g.__ajaiaTestDb = db;
}
