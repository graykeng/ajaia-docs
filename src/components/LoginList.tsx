"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { User } from "@/lib/auth";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

export function LoginList({ users }: { users: User[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function signIn(userId: string) {
    setPending(userId);
    setError(null);
    try {
      await api("/api/session", { json: { userId } });
      router.push("/");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
      setPending(null);
    }
  }

  return (
    <>
      <ul className="login-list">
        {users.map((u) => (
          <li key={u.id}>
            <button onClick={() => signIn(u.id)} disabled={pending !== null}>
              <Avatar name={u.name} color={u.color} size={36} />
              <span>
                <strong>{u.name}</strong>
                <small>{u.email}</small>
              </span>
              <span className="login-go">{pending === u.id ? "Signing in…" : "Sign in →"}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && <p className="error-text" role="alert">{error}</p>}
    </>
  );
}
