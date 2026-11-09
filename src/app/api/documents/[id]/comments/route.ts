import { addComment, listComments } from "@/lib/documents";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";
import { commentSchema } from "@/lib/validation";

type Params = { id: string };

export const GET = authed<Params>(async (_req, user, { id }) => ({ comments: await listComments(user, id) }));

export const POST = authed<Params>(async (req, user, { id }) => {
  const { body, quote } = commentSchema.parse(await readJson(req));
  await addComment(user, id, body, quote);
  return Response.json({ comments: await listComments(user, id) }, { status: 201 });
});
