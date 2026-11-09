import { requireUser, type User } from "./auth";
import { errorResponse } from "./http";

/**
 * Wraps a route handler with the two things every API route needs:
 * an authenticated user and consistent JSON error responses.
 */
export function authed<P = Record<string, never>>(
  fn: (req: Request, user: User, params: P) => Promise<unknown>,
) {
  return async (req: Request, ctx: { params: Promise<P> }): Promise<Response> => {
    try {
      const user = await requireUser(req);
      const out = await fn(req, user, await ctx.params);
      return out instanceof Response ? out : Response.json(out);
    } catch (e) {
      return errorResponse(e);
    }
  };
}
