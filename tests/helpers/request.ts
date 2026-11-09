/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions read untyped JSON responses */
import { createSessionToken, SESSION_COOKIE } from "@/lib/auth";

type Handler<P> = (req: Request, ctx: { params: Promise<P> }) => Promise<Response>;

interface CallOptions<P> {
  /** Seeded user id to sign in as; omit for an anonymous request. */
  as?: string;
  method?: string;
  json?: unknown;
  form?: FormData;
  params?: P;
}

/** Invokes a route handler the way Next.js would, and parses the JSON reply. */
export async function call<P = Record<string, never>>(handler: Handler<P>, opts: CallOptions<P> = {}) {
  const headers = new Headers();
  if (opts.as) headers.set("cookie", `${SESSION_COOKIE}=${encodeURIComponent(createSessionToken(opts.as))}`);
  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("content-type", "application/json");
    body = JSON.stringify(opts.json);
  } else if (opts.form) {
    body = opts.form;
  }
  const req = new Request("http://test.local/api", { method: opts.method ?? (body ? "POST" : "GET"), headers, body });
  const res = await handler(req, { params: Promise.resolve(opts.params ?? ({} as P)) });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* non-JSON response (e.g. Markdown export) */
  }
  return { status: res.status, data, headers: res.headers };
}

export const ALICE = "u_alice";
export const BOB = "u_bob";
export const CAROL = "u_carol";
