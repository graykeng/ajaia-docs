import { getVersion, restoreVersion } from "@/lib/documents";
import { authed } from "@/lib/route";

type Params = { id: string; versionId: string };

/** Preview a past version. */
export const GET = authed<Params>(async (_req, user, { id, versionId }) => ({
  version: await getVersion(user, id, versionId),
}));

/** Restore a past version as the current content. */
export const POST = authed<Params>(async (_req, user, { id, versionId }) => ({
  document: await restoreVersion(user, id, versionId),
}));
