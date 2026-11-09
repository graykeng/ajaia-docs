"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { User } from "@/lib/auth";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function UserMenu({ user }: { user: User }) {
  const router = useRouter();
  async function switchUser() {
    await api("/api/session", { method: "DELETE" }).catch(() => {});
    router.push("/login");
    router.refresh();
  }
  return (
    <div className="user-menu no-print">
      <Avatar name={user.name} color={user.color} />
      <span className="user-name">{user.name}</span>
      <button className="btn btn-ghost" onClick={switchUser}>
        Switch user
      </button>
    </div>
  );
}

export function AppHeader({ user }: { user: User }) {
  return (
    <header className="app-header">
      <Link href="/" className="brand">
        <span className="brand-mark">A</span> Ajaia Docs
      </Link>
      <UserMenu user={user} />
    </header>
  );
}
