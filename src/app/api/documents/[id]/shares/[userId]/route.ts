import { listShares, unshareDocument } from "@/lib/documents";
import { authed } from "@/lib/route";

export const DELETE = authed<{ id: string; userId: string }>(async (_req, user, { id, userId }) => {
  await unshareDocument(user, id, userId);
  return listShares(user, id);
});
