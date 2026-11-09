import { createHmac, timingSafeEqual } from "node:crypto";
import { getDb } from "./db";
import { HttpError } from "./http";

/**
 * Mock auth: reviewers pick one of the seeded users on /login. There are no
 * passwords. The session cookie holds the user id plus an HMAC signature, so
 * it cannot be forged client-side, but anyone can choose any seeded user by
 * design.
 */

export const SESSION_COOKIE = "ajaia_session";

export interface User {
  id: string;
  name: string;
  email: string;
  color: string;
}

function secret(): string {
  return process.env.SESSION_SECRET || "dev-only-secret-change-me";
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(userId: string): string {
  return `${userId}.${sign(userId)}`;
}

/** Returns the user id if the token's signature is valid, otherwise null. */
export function verifySessionToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const given = Buffer.from(token.slice(dot + 1));
  const expected = Buffer.from(sign(userId));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return userId;
}

export async function getUserById(id: string): Promise<User | null> {
  const db = await getDb();
  const res = await db.execute({ sql: "SELECT id, name, email, color FROM users WHERE id = ?", args: [id] });
  const r = res.rows[0];
  return r ? { id: String(r.id), name: String(r.name), email: String(r.email), color: String(r.color) } : null;
}

export async function listUsers(): Promise<User[]> {
  const db = await getDb();
  const res = await db.execute("SELECT id, name, email, color FROM users ORDER BY name");
  return res.rows.map((r) => ({
    id: String(r.id),
    name: String(r.name),
    email: String(r.email),
    color: String(r.color),
  }));
}

export async function getUserFromToken(token: string | undefined | null): Promise<User | null> {
  const userId = verifySessionToken(token);
  return userId ? getUserById(userId) : null;
}

function readCookie(req: Request, name: string): string | null {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return null;
}

/** For API routes: resolves the signed-in user or throws 401. */
export async function requireUser(req: Request): Promise<User> {
  const user = await getUserFromToken(readCookie(req, SESSION_COOKIE));
  if (!user) throw new HttpError(401, "Please sign in.");
  return user;
}

export function sessionCookieHeader(token: string | null): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return token
    ? `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`
    : `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}
