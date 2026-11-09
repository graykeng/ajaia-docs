import { createSessionToken, getUserById, sessionCookieHeader } from "@/lib/auth";
import { errorResponse, HttpError, readJson } from "@/lib/http";
import { loginSchema } from "@/lib/validation";

/** Sign in as one of the seeded users (mock auth, no password). */
export async function POST(req: Request) {
  try {
    const { userId } = loginSchema.parse(await readJson(req));
    const user = await getUserById(userId);
    if (!user) throw new HttpError(404, "That user does not exist.");
    return Response.json(
      { user },
      { headers: { "Set-Cookie": sessionCookieHeader(createSessionToken(user.id)) } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE() {
  return Response.json({ ok: true }, { headers: { "Set-Cookie": sessionCookieHeader(null) } });
}
