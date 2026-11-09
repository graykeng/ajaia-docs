import { deleteDocument, getDocument, updateDocument } from "@/lib/documents";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";
import { updateDocumentSchema } from "@/lib/validation";

type Params = { id: string };

export const GET = authed<Params>(async (_req, user, { id }) => {
  const { doc, access, ownerName } = await getDocument(user, id);
  return { document: doc, access, ownerName };
});

export const PATCH = authed<Params>(async (req, user, { id }) => {
  const input = updateDocumentSchema.parse(await readJson(req));
  return { document: await updateDocument(user, id, input) };
});

export const DELETE = authed<Params>(async (_req, user, { id }) => {
  await deleteDocument(user, id);
  return { ok: true };
});
