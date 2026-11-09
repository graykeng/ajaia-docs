import { listVersions } from "@/lib/documents";
import { authed } from "@/lib/route";

export const GET = authed<{ id: string }>(async (_req, user, { id }) => ({
  versions: await listVersions(user, id),
}));
