import { heartbeat, leave } from "@/lib/documents";
import { authed } from "@/lib/route";

type Params = { id: string };

export const POST = authed<Params>(async (_req, user, { id }) => heartbeat(user, id));

export const DELETE = authed<Params>(async (_req, user, { id }) => {
  await leave(user, id);
  return { ok: true };
});
