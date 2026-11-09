import { deleteComment, listComments, setCommentResolved } from "@/lib/documents";
import { readJson } from "@/lib/http";
import { authed } from "@/lib/route";
import { updateCommentSchema } from "@/lib/validation";

type Params = { id: string; commentId: string };

export const PATCH = authed<Params>(async (req, user, { id, commentId }) => {
  const { resolved } = updateCommentSchema.parse(await readJson(req));
  await setCommentResolved(user, id, commentId, resolved);
  return { comments: await listComments(user, id) };
});

export const DELETE = authed<Params>(async (_req, user, { id, commentId }) => {
  await deleteComment(user, id, commentId);
  return { comments: await listComments(user, id) };
});
