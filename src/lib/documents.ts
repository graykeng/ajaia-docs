import TurndownService from "turndown";
import {
  canComment,
  canEdit,
  canManage,
  canView,
  resolveAccess,
  type Access,
  type ShareRole,
} from "./access";
import type { User } from "./auth";
import { getDb, type Db } from "./db";
import { HttpError } from "./http";
import { sanitizeContent } from "./sanitize";

/**
 * All document behaviour lives here. Every function takes the acting user and
 * checks access before touching data, so routes and pages stay thin and there
 * is exactly one place where permissions are enforced.
 */

export interface DocumentRecord {
  id: string;
  title: string;
  content: string;
  ownerId: string;
  version: number;
  createdAt: number;
  updatedAt: number;
  updatedBy: string;
}

export interface DocumentSummary {
  id: string;
  title: string;
  updatedAt: number;
  ownerName: string;
  access: Access;
  shareCount: number;
}

const DEFAULT_TITLE = "Untitled document";
/** Saves by the same author within this window update one history entry. */
const VERSION_SESSION_MS = 10 * 60 * 1000;
const MAX_VERSIONS = 50;
/** A user counts as "in the document" if they sent a heartbeat this recently. */
const PRESENCE_WINDOW_MS = 15 * 1000;

const newId = (prefix: string) => `${prefix}_${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;

function toDoc(r: Record<string, unknown>): DocumentRecord {
  return {
    id: String(r.id),
    title: String(r.title),
    content: String(r.content),
    ownerId: String(r.owner_id),
    version: Number(r.version),
    createdAt: Number(r.created_at),
    updatedAt: Number(r.updated_at),
    updatedBy: String(r.updated_by),
  };
}

/** Loads a document and the caller's access, or throws 404 / 403. */
async function load(
  db: Db,
  user: User,
  docId: string,
  allowed: (a: Access) => boolean,
  denied = "You don't have permission to do that.",
): Promise<{ doc: DocumentRecord; access: Access }> {
  const res = await db.execute({ sql: "SELECT * FROM documents WHERE id = ?", args: [docId] });
  if (!res.rows[0]) throw new HttpError(404, "Document not found.");
  const doc = toDoc(res.rows[0]);
  const shares = await db.execute({
    sql: "SELECT user_id, role FROM shares WHERE document_id = ? AND user_id = ?",
    args: [docId, user.id],
  });
  const access = resolveAccess(
    user.id,
    doc,
    shares.rows.map((s) => ({ userId: String(s.user_id), role: s.role as ShareRole })),
  );
  if (!canView(access)) throw new HttpError(403, "You don't have access to this document.");
  if (!allowed(access)) throw new HttpError(403, denied);
  return { doc, access };
}

// ---------------------------------------------------------------- documents

export async function listDocuments(user: User): Promise<{ owned: DocumentSummary[]; shared: DocumentSummary[] }> {
  const db = await getDb();
  const owned = await db.execute({
    sql: `SELECT d.id, d.title, d.updated_at,
                 (SELECT COUNT(*) FROM shares s WHERE s.document_id = d.id) AS share_count
          FROM documents d WHERE d.owner_id = ? ORDER BY d.updated_at DESC`,
    args: [user.id],
  });
  const shared = await db.execute({
    sql: `SELECT d.id, d.title, d.updated_at, s.role, u.name AS owner_name
          FROM shares s
          JOIN documents d ON d.id = s.document_id
          JOIN users u ON u.id = d.owner_id
          WHERE s.user_id = ? ORDER BY d.updated_at DESC`,
    args: [user.id],
  });
  return {
    owned: owned.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      updatedAt: Number(r.updated_at),
      ownerName: user.name,
      access: "owner" as const,
      shareCount: Number(r.share_count),
    })),
    shared: shared.rows.map((r) => ({
      id: String(r.id),
      title: String(r.title),
      updatedAt: Number(r.updated_at),
      ownerName: String(r.owner_name),
      access: r.role as ShareRole,
      shareCount: 0,
    })),
  };
}

export async function createDocument(
  user: User,
  input: { title?: string; content?: string; versionLabel?: string } = {},
): Promise<DocumentRecord> {
  const db = await getDb();
  const now = Date.now();
  const doc: DocumentRecord = {
    id: newId("d"),
    title: input.title?.trim() || DEFAULT_TITLE,
    content: sanitizeContent(input.content ?? ""),
    ownerId: user.id,
    version: 1,
    createdAt: now,
    updatedAt: now,
    updatedBy: user.id,
  };
  await db.batch([
    {
      sql: `INSERT INTO documents (id, title, content, owner_id, version, created_at, updated_at, updated_by)
            VALUES (?, ?, ?, ?, 1, ?, ?, ?)`,
      args: [doc.id, doc.title, doc.content, user.id, now, now, user.id],
    },
    {
      sql: `INSERT INTO versions (id, document_id, title, content, author_id, label, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newId("v"), doc.id, doc.title, doc.content, user.id, input.versionLabel ?? "Created", now, now],
    },
  ]);
  return doc;
}

export async function getDocument(user: User, docId: string) {
  const db = await getDb();
  const { doc, access } = await load(db, user, docId, canView);
  const owner = await db.execute({ sql: "SELECT name FROM users WHERE id = ?", args: [doc.ownerId] });
  return { doc, access, ownerName: String(owner.rows[0]?.name ?? "Unknown") };
}

export async function updateDocument(
  user: User,
  docId: string,
  input: { title?: string; content?: string; baseVersion?: number; force?: boolean },
): Promise<DocumentRecord> {
  const db = await getDb();
  const { doc } = await load(db, user, docId, canEdit, "You have read-only access to this document.");
  const now = Date.now();

  if (input.title !== undefined && input.title !== doc.title) {
    // Renames do not bump the content version, so they never conflict with typing.
    await db.execute({
      sql: "UPDATE documents SET title = ?, updated_at = ?, updated_by = ? WHERE id = ?",
      args: [input.title, now, user.id, docId],
    });
    doc.title = input.title;
    doc.updatedAt = now;
    doc.updatedBy = user.id;
  }

  if (input.content !== undefined) {
    const content = sanitizeContent(input.content);
    const expected = input.force || input.baseVersion === undefined ? null : input.baseVersion;
    // Optimistic concurrency: the write only lands if nobody saved in between.
    const res = await db.execute({
      sql: `UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ?
            WHERE id = ? AND (? IS NULL OR version = ?)`,
      args: [content, now, user.id, docId, expected, expected],
    });
    if (res.rowsAffected === 0) {
      const latest = await db.execute({
        sql: `SELECT d.version, u.name FROM documents d JOIN users u ON u.id = d.updated_by WHERE d.id = ?`,
        args: [docId],
      });
      throw new HttpError(409, "This document was changed by someone else while you were editing.", {
        version: Number(latest.rows[0]?.version ?? doc.version),
        updatedByName: String(latest.rows[0]?.name ?? "Someone"),
      });
    }
    const after = await db.execute({ sql: "SELECT version FROM documents WHERE id = ?", args: [docId] });
    doc.content = content;
    doc.version = Number(after.rows[0].version);
    doc.updatedAt = now;
    doc.updatedBy = user.id;
    await recordVersion(db, doc, user.id);
  }
  return doc;
}

export async function deleteDocument(user: User, docId: string): Promise<void> {
  const db = await getDb();
  await load(db, user, docId, canManage, "Only the owner can delete this document.");
  await db.batch(
    ["documents WHERE id", "shares WHERE document_id", "comments WHERE document_id", "versions WHERE document_id", "presence WHERE document_id"].map(
      (target) => ({ sql: `DELETE FROM ${target} = ?`, args: [docId] }),
    ),
  );
}

// ------------------------------------------------------------------ sharing

export interface ShareEntry {
  userId: string;
  name: string;
  email: string;
  color: string;
  role: ShareRole;
}

export async function listShares(user: User, docId: string) {
  const db = await getDb();
  const { doc, access } = await load(db, user, docId, canView);
  const owner = await db.execute({ sql: "SELECT id, name, email, color FROM users WHERE id = ?", args: [doc.ownerId] });
  const res = await db.execute({
    sql: `SELECT u.id, u.name, u.email, u.color, s.role
          FROM shares s JOIN users u ON u.id = s.user_id
          WHERE s.document_id = ? ORDER BY s.created_at`,
    args: [docId],
  });
  const o = owner.rows[0];
  return {
    access,
    owner: { userId: String(o.id), name: String(o.name), email: String(o.email), color: String(o.color) },
    shares: res.rows.map(
      (r): ShareEntry => ({
        userId: String(r.id),
        name: String(r.name),
        email: String(r.email),
        color: String(r.color),
        role: r.role as ShareRole,
      }),
    ),
  };
}

/** Grants access, or changes the role if the user already has access. */
export async function shareDocument(user: User, docId: string, email: string, role: ShareRole): Promise<void> {
  const db = await getDb();
  const { doc } = await load(db, user, docId, canManage, "Only the owner can change sharing.");
  const target = await db.execute({ sql: "SELECT id FROM users WHERE lower(email) = ?", args: [email.toLowerCase()] });
  if (!target.rows[0]) throw new HttpError(404, `No user found with the email ${email}.`);
  const targetId = String(target.rows[0].id);
  if (targetId === doc.ownerId) throw new HttpError(400, "You already own this document.");
  await db.execute({
    sql: `INSERT INTO shares (document_id, user_id, role, created_at) VALUES (?, ?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET role = excluded.role`,
    args: [docId, targetId, role, Date.now()],
  });
}

export async function unshareDocument(user: User, docId: string, targetUserId: string): Promise<void> {
  const db = await getDb();
  await load(db, user, docId, canManage, "Only the owner can change sharing.");
  await db.batch([
    { sql: "DELETE FROM shares WHERE document_id = ? AND user_id = ?", args: [docId, targetUserId] },
    { sql: "DELETE FROM presence WHERE document_id = ? AND user_id = ?", args: [docId, targetUserId] },
  ]);
}

// ----------------------------------------------------------------- comments

export interface CommentEntry {
  id: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  body: string;
  quote: string | null;
  resolved: boolean;
  createdAt: number;
}

export async function listComments(user: User, docId: string): Promise<CommentEntry[]> {
  const db = await getDb();
  await load(db, user, docId, canView);
  const res = await db.execute({
    sql: `SELECT c.id, c.author_id, c.body, c.quote, c.resolved, c.created_at, u.name, u.color
          FROM comments c JOIN users u ON u.id = c.author_id
          WHERE c.document_id = ? ORDER BY c.created_at`,
    args: [docId],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    authorId: String(r.author_id),
    authorName: String(r.name),
    authorColor: String(r.color),
    body: String(r.body),
    quote: r.quote ? String(r.quote) : null,
    resolved: Number(r.resolved) === 1,
    createdAt: Number(r.created_at),
  }));
}

export async function addComment(user: User, docId: string, body: string, quote?: string): Promise<void> {
  const db = await getDb();
  await load(db, user, docId, canComment, "Viewers cannot comment on this document.");
  await db.execute({
    sql: `INSERT INTO comments (id, document_id, author_id, body, quote, resolved, created_at)
          VALUES (?, ?, ?, ?, ?, 0, ?)`,
    args: [newId("c"), docId, user.id, body, quote || null, Date.now()],
  });
}

export async function setCommentResolved(user: User, docId: string, commentId: string, resolved: boolean) {
  const db = await getDb();
  await load(db, user, docId, canComment, "Viewers cannot resolve comments.");
  const res = await db.execute({
    sql: "UPDATE comments SET resolved = ? WHERE id = ? AND document_id = ?",
    args: [resolved ? 1 : 0, commentId, docId],
  });
  if (res.rowsAffected === 0) throw new HttpError(404, "Comment not found.");
}

export async function deleteComment(user: User, docId: string, commentId: string): Promise<void> {
  const db = await getDb();
  const { access } = await load(db, user, docId, canView);
  const res = await db.execute({
    sql: "SELECT author_id FROM comments WHERE id = ? AND document_id = ?",
    args: [commentId, docId],
  });
  if (!res.rows[0]) throw new HttpError(404, "Comment not found.");
  if (String(res.rows[0].author_id) !== user.id && !canManage(access)) {
    throw new HttpError(403, "You can only delete your own comments.");
  }
  await db.execute({ sql: "DELETE FROM comments WHERE id = ?", args: [commentId] });
}

// ---------------------------------------------------------- version history

export interface VersionEntry {
  id: string;
  title: string;
  label: string | null;
  authorName: string;
  updatedAt: number;
}

/**
 * Called after every content save. Consecutive saves by one author within
 * VERSION_SESSION_MS collapse into a single entry, so history reads as
 * "editing sessions" rather than one row per autosave.
 */
async function recordVersion(db: Db, doc: DocumentRecord, authorId: string, label?: string): Promise<void> {
  const now = Date.now();
  const latest = await db.execute({
    sql: `SELECT id, author_id, label, created_at FROM versions
          WHERE document_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT 1`,
    args: [doc.id],
  });
  const last = latest.rows[0];
  const sameSession =
    !label &&
    last &&
    last.label === null &&
    String(last.author_id) === authorId &&
    now - Number(last.created_at) < VERSION_SESSION_MS;

  if (sameSession) {
    await db.execute({
      sql: "UPDATE versions SET title = ?, content = ?, updated_at = ? WHERE id = ?",
      args: [doc.title, doc.content, now, String(last.id)],
    });
    return;
  }
  await db.batch([
    {
      sql: `INSERT INTO versions (id, document_id, title, content, author_id, label, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [newId("v"), doc.id, doc.title, doc.content, authorId, label ?? null, now, now],
    },
    {
      sql: `DELETE FROM versions WHERE document_id = ? AND id NOT IN (
              SELECT id FROM versions WHERE document_id = ? ORDER BY updated_at DESC, rowid DESC LIMIT ?
            )`,
      args: [doc.id, doc.id, MAX_VERSIONS],
    },
  ]);
}

export async function listVersions(user: User, docId: string): Promise<VersionEntry[]> {
  const db = await getDb();
  await load(db, user, docId, canView);
  const res = await db.execute({
    sql: `SELECT v.id, v.title, v.label, v.updated_at, u.name
          FROM versions v JOIN users u ON u.id = v.author_id
          WHERE v.document_id = ? ORDER BY v.updated_at DESC, v.rowid DESC`,
    args: [docId],
  });
  return res.rows.map((r) => ({
    id: String(r.id),
    title: String(r.title),
    label: r.label ? String(r.label) : null,
    authorName: String(r.name),
    updatedAt: Number(r.updated_at),
  }));
}

export async function getVersion(user: User, docId: string, versionId: string) {
  const db = await getDb();
  await load(db, user, docId, canView);
  const res = await db.execute({
    sql: "SELECT id, title, content, updated_at FROM versions WHERE id = ? AND document_id = ?",
    args: [versionId, docId],
  });
  const r = res.rows[0];
  if (!r) throw new HttpError(404, "Version not found.");
  return { id: String(r.id), title: String(r.title), content: String(r.content), updatedAt: Number(r.updated_at) };
}

/** Restoring writes the old content as a new save, so restores are themselves undoable. */
export async function restoreVersion(user: User, docId: string, versionId: string): Promise<DocumentRecord> {
  const db = await getDb();
  const { doc } = await load(db, user, docId, canEdit, "You have read-only access to this document.");
  const version = await getVersion(user, docId, versionId);
  const now = Date.now();
  await db.execute({
    sql: `UPDATE documents SET content = ?, version = version + 1, updated_at = ?, updated_by = ? WHERE id = ?`,
    args: [version.content, now, user.id, docId],
  });
  const restored = { ...doc, content: version.content, version: doc.version + 1, updatedAt: now, updatedBy: user.id };
  const when = new Date(version.updatedAt).toISOString().slice(0, 16).replace("T", " ");
  await recordVersion(db, restored, user.id, `Restored version from ${when} UTC`);
  return restored;
}

// ----------------------------------------------------------------- presence

/**
 * Lightweight collaboration signal: each open editor sends a heartbeat every
 * few seconds and gets back who else is here plus the current version, which
 * is how clients notice remote changes without websockets.
 */
export async function heartbeat(user: User, docId: string) {
  const db = await getDb();
  const { doc, access } = await load(db, user, docId, canView);
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO presence (document_id, user_id, last_seen) VALUES (?, ?, ?)
          ON CONFLICT (document_id, user_id) DO UPDATE SET last_seen = excluded.last_seen`,
    args: [docId, user.id, now],
  });
  const res = await db.execute({
    sql: `SELECT u.id, u.name, u.color FROM presence p JOIN users u ON u.id = p.user_id
          WHERE p.document_id = ? AND p.user_id != ? AND p.last_seen > ? ORDER BY u.name`,
    args: [docId, user.id, now - PRESENCE_WINDOW_MS],
  });
  const editor = await db.execute({ sql: "SELECT name FROM users WHERE id = ?", args: [doc.updatedBy] });
  return {
    access,
    title: doc.title,
    version: doc.version,
    updatedBy: doc.updatedBy,
    updatedByName: String(editor.rows[0]?.name ?? "Someone"),
    others: res.rows.map((r) => ({ id: String(r.id), name: String(r.name), color: String(r.color) })),
  };
}

export async function leave(user: User, docId: string): Promise<void> {
  const db = await getDb();
  await db.execute({ sql: "DELETE FROM presence WHERE document_id = ? AND user_id = ?", args: [docId, user.id] });
}

// ------------------------------------------------------------------- export

export function htmlToMarkdown(title: string, html: string): string {
  const turndown = new TurndownService({ headingStyle: "atx", bulletListMarker: "-", codeBlockStyle: "fenced" });
  turndown.keep(["u"]); // Markdown has no underline; keep it as inline HTML.
  turndown.addRule("strike", { filter: ["s"], replacement: (text) => `~~${text}~~` });
  const body = turndown.turndown(html || "<p></p>").trim();
  return /^#\s/.test(body) ? `${body}\n` : `# ${title}\n\n${body}\n`;
}

export async function exportMarkdown(user: User, docId: string): Promise<{ filename: string; markdown: string }> {
  const db = await getDb();
  const { doc } = await load(db, user, docId, canView);
  const filename = `${doc.title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "document"}.md`;
  return { filename, markdown: htmlToMarkdown(doc.title, doc.content) };
}
