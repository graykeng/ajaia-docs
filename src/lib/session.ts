import { cookies } from "next/headers";
import { getUserFromToken, SESSION_COOKIE, type User } from "./auth";

/** For server components: the signed-in user, or null. */
export async function getCurrentUser(): Promise<User | null> {
  const store = await cookies();
  return getUserFromToken(store.get(SESSION_COOKIE)?.value);
}
