import { createDocument, listDocuments } from "@/lib/documents";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";
import { createDocumentSchema } from "@/lib/validation";

export const GET = authed(async (_req, user) => listDocuments(user));

export const POST = authed(async (req, user) => {
  const input = createDocumentSchema.parse(await readJson(req));
  const doc = await createDocument(user, input);
  return Response.json({ document: doc }, { status: 201 });
});
