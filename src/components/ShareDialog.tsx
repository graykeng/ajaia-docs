"use client";

import { useEffect, useState } from "react";
import { ACCESS_LABEL, SHARE_ROLES, type ShareRole } from "@/lib/access";
import type { User } from "@/lib/auth";
import type { ShareEntry } from "@/lib/documents";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";

interface ShareState {
  owner: { userId: string; name: string; email: string; color: string };
  shares: ShareEntry[];
}

const ROLE_HELP: Record<ShareRole, string> = {
  viewer: "Can read",
  commenter: "Can read and comment",
  editor: "Can read, comment and edit",
};

export function ShareDialog({
  docUrl,
  canManage,
  onClose,
}: {
  docUrl: string;
  canManage: boolean;
  onClose: () => void;
}) {
  const [state, setState] = useState<ShareState | null>(null);
  const [directory, setDirectory] = useState<User[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<ShareRole>("viewer");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<ShareState>(`${docUrl}/shares`).then(setState).catch((e) => setError(e.message));
    api<{ users: User[] }>("/api/users").then((r) => setDirectory(r.users)).catch(() => {});
  }, [docUrl]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function run(request: () => Promise<ShareState>) {
    setBusy(true);
    setError(null);
    try {
      setState(await request());
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Enter the email address of the person to share with.");
      return;
    }
    if (await run(() => api<ShareState>(`${docUrl}/shares`, { json: { email, role } }))) setEmail("");
  }

  const taken = new Set([state?.owner.userId, ...(state?.shares.map((s) => s.userId) ?? [])]);
  const suggestions = directory.filter((u) => !taken.has(u.id));

  return (
    <div className="overlay no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="dialog" role="dialog" aria-modal aria-label="Share document">
        <div className="dialog-head">
          <h2>Share document</h2>
          <button className="btn btn-ghost" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {canManage ? (
          <form className="share-form" onSubmit={add}>
            <input
              type="email"
              list="share-suggestions"
              placeholder="Email address"
              aria-label="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
            <datalist id="share-suggestions">
              {suggestions.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.name}
                </option>
              ))}
            </datalist>
            <select value={role} onChange={(e) => setRole(e.target.value as ShareRole)} aria-label="Role">
              {SHARE_ROLES.map((r) => (
                <option key={r} value={r}>
                  {ACCESS_LABEL[r]}
                </option>
              ))}
            </select>
            <button className="btn btn-primary" disabled={busy}>
              Share
            </button>
          </form>
        ) : (
          <p className="muted">Only the owner can change who has access.</p>
        )}
        {canManage && (
          <p className="muted hint">
            {ROLE_HELP[role]}.
            {suggestions.length > 0 && <> Demo accounts: {suggestions.map((u) => u.email).join(", ")}</>}
          </p>
        )}
        {error && <p className="error-text" role="alert">{error}</p>}

        <h3>People with access</h3>
        {!state ? (
          <p className="muted">Loading…</p>
        ) : (
          <ul className="people">
            <li>
              <Avatar name={state.owner.name} color={state.owner.color} />
              <span className="person">
                <strong>{state.owner.name}</strong>
                <small>{state.owner.email}</small>
              </span>
              <span className="badge badge-owner">Owner</span>
            </li>
            {state.shares.map((s) => (
              <li key={s.userId}>
                <Avatar name={s.name} color={s.color} />
                <span className="person">
                  <strong>{s.name}</strong>
                  <small>{s.email}</small>
                </span>
                {canManage ? (
                  <>
                    <select
                      value={s.role}
                      disabled={busy}
                      aria-label={`Role for ${s.name}`}
                      onChange={(e) =>
                        run(() => api<ShareState>(`${docUrl}/shares`, { json: { email: s.email, role: e.target.value } }))
                      }
                    >
                      {SHARE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ACCESS_LABEL[r]}
                        </option>
                      ))}
                    </select>
                    <button
                      className="btn btn-ghost btn-danger"
                      disabled={busy}
                      onClick={() => run(() => api<ShareState>(`${docUrl}/shares/${s.userId}`, { method: "DELETE" }))}
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <span className="badge">{ACCESS_LABEL[s.role]}</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
