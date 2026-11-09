"use client";

import { useState } from "react";
import { canComment, canManage, type Access } from "@/lib/access";
import type { User } from "@/lib/auth";
import type { CommentEntry } from "@/lib/documents";
import { api } from "@/lib/api";
import { Avatar } from "./Avatar";
import { LocalTime } from "./LocalTime";

interface Props {
  docUrl: string;
  user: User;
  access: Access;
  comments: CommentEntry[];
  /** Text currently selected in the editor; attached to a new comment as a quote. */
  selectionText: string;
  onChange: (comments: CommentEntry[]) => void;
  onClose: () => void;
}

export function CommentsPanel({ docUrl, user, access, comments, selectionText, onChange, onClose }: Props) {
  const [body, setBody] = useState("");
  const [showResolved, setShowResolved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowed = canComment(access);

  async function run(request: () => Promise<{ comments: CommentEntry[] }>) {
    setBusy(true);
    setError(null);
    try {
      onChange((await request()).comments);
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    const ok = await run(() =>
      api(`${docUrl}/comments`, { json: { body, quote: selectionText || undefined } }),
    );
    if (ok) setBody("");
  }

  const resolvedCount = comments.filter((c) => c.resolved).length;
  const visible = comments.filter((c) => showResolved || !c.resolved);

  return (
    <aside className="side-panel no-print" aria-label="Comments">
      <div className="panel-head">
        <h2>Comments</h2>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close comments">
          ✕
        </button>
      </div>

      {allowed ? (
        <form className="comment-form" onSubmit={submit}>
          {selectionText && <blockquote className="quote">“{selectionText}”</blockquote>}
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={selectionText ? "Comment on the selected text…" : "Add a comment…"}
            aria-label="New comment"
            maxLength={2000}
            rows={3}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit(e);
            }}
          />
          <div className="comment-form-row">
            <small className="muted">Select text in the document to quote it.</small>
            <button className="btn btn-primary" disabled={busy || !body.trim()}>
              Comment
            </button>
          </div>
        </form>
      ) : (
        <p className="muted">Viewers can read comments but not add them.</p>
      )}
      {error && <p className="error-text" role="alert">{error}</p>}

      {visible.length === 0 && <p className="empty">No {showResolved ? "" : "open "}comments yet.</p>}
      <ul className="comments">
        {visible.map((c) => (
          <li key={c.id} className={c.resolved ? "comment resolved" : "comment"}>
            <div className="comment-head">
              <Avatar name={c.authorName} color={c.authorColor} size={24} />
              <strong>{c.authorName}</strong>
              <small className="muted">
                <LocalTime ts={c.createdAt} />
              </small>
            </div>
            {c.quote && <blockquote className="quote">“{c.quote}”</blockquote>}
            <p>{c.body}</p>
            <div className="comment-actions">
              {allowed && (
                <button
                  className="link-btn"
                  disabled={busy}
                  onClick={() =>
                    run(() => api(`${docUrl}/comments/${c.id}`, { method: "PATCH", json: { resolved: !c.resolved } }))
                  }
                >
                  {c.resolved ? "Reopen" : "Resolve"}
                </button>
              )}
              {(c.authorId === user.id || canManage(access)) && (
                <button
                  className="link-btn danger"
                  disabled={busy}
                  onClick={() => run(() => api(`${docUrl}/comments/${c.id}`, { method: "DELETE" }))}
                >
                  Delete
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
      {resolvedCount > 0 && (
        <button className="link-btn" onClick={() => setShowResolved(!showResolved)}>
          {showResolved ? "Hide" : "Show"} {resolvedCount} resolved
        </button>
      )}
    </aside>
  );
}
