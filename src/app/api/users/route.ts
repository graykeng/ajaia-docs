import { listUsers } from "@/lib/auth";
import { authed } from "@/lib/route";

/** Directory of users, used to suggest people in the share dialog. */
export const GET = authed(async () => ({ users: await listUsers() }));
