import { listShares, shareDocument } from "@/lib/documents";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";
import { shareSchema } from "@/lib/validation";

type Params = { id: string };

export const GET = authed<Params>(async (_req, user, { id }) => listShares(user, id));

export const POST = authed<Params>(async (req, user, { id }) => {
  const { email, role } = shareSchema.parse(await readJson(req));
  await shareDocument(user, id, email, role);
  return listShares(user, id);
});
