import { redirect } from "next/navigation";
import { listUsers } from "@/lib/auth";
import { getCurrentUser } from "@/lib/session";
import { LoginList } from "@/components/LoginList";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (await getCurrentUser()) redirect("/");
  const users = await listUsers();
  return (
    <main className="login">
      <div className="login-card">
        <h1>
          <span className="brand-mark">A</span> Ajaia Docs
        </h1>
        <p className="muted">
          This demo uses seeded accounts instead of passwords. Choose who to sign in as. To test sharing, sign in as
          a second user in another browser profile or a private window.
        </p>
        <LoginList users={users} />
      </div>
    </main>
  );
}
