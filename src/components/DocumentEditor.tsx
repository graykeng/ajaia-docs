"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Placeholder } from "@tiptap/extensions";
import { ACCESS_LABEL, canComment, canEdit, canManage, type Access } from "@/lib/access";
import type { User } from "@/lib/auth";
import type { CommentEntry } from "@/lib/documents";
import { api, ApiError } from "@/lib/api";
import { UserMenu } from "./AppHeader";
import { Avatar } from "./Avatar";
import { CommentsPanel } from "./CommentsPanel";
import { HistoryPanel } from "./HistoryPanel";
import { ShareDialog } from "./ShareDialog";
import { Toolbar } from "./Toolbar";

const AUTOSAVE_DELAY_MS = 800;
const HEARTBEAT_MS = 4000;

type SaveStatus = "saved" | "dirty" | "saving" | "error" | "conflict";

interface Heartbeat {
  access: Access;
  title: string;
  version: number;
  updatedBy: string;
  updatedByName: string;
  others: { id: string; name: string; color: string }[];
}

interface Props {
  user: User;
  initial: { id: string; title: string; content: string; version: number };
  initialAccess: Access;
  ownerName: string;
}

const STATUS_TEXT: Record<SaveStatus, string> = {
  saved: "All changes saved",
  dirty: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn't save",
  conflict: "Save paused",
};

export function DocumentEditor({ user, initial, initialAccess, ownerName }: Props) {
  const docUrl = `/api/documents/${initial.id}`;

  const [access, setAccess] = useState<Access>(initialAccess);
  const [title, setTitle] = useState(initial.title);
  const [status, setStatus] = useState<SaveStatus>("saved");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictBy, setConflictBy] = useState<string | null>(null);
  const [lostAccess, setLostAccess] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [others, setOthers] = useState<Heartbeat["others"]>([]);
  const [panel, setPanel] = useState<"comments" | "history" | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [comments, setComments] = useState<CommentEntry[]>([]);
  const [selectionText, setSelectionText] = useState("");

  // Refs hold the state the save loop and heartbeat need without re-subscribing.
  const versionRef = useRef(initial.version);
  const savedTitleRef = useRef(initial.title);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);
  const pausedRef = useRef(false); // true while a conflict awaits the user's decision
  const applyingRemoteRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const titleFocusedRef = useRef(false);
  const flushRef = useRef<(force?: boolean) => Promise<void>>(async () => {});

  const editable = canEdit(access) && !lostAccess;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, link: { openOnClick: false } }),
      Placeholder.configure({ placeholder: "Start writing…" }),
    ],
    content: initial.content,
    editable: canEdit(initialAccess),
    immediatelyRender: false, // required for server-side rendering
    editorProps: { attributes: { class: "doc-content", "aria-label": "Document content" } },
    onUpdate: ({ transaction }) => {
      // Only real content changes count as edits (not focus, selection or mode changes).
      if (applyingRemoteRef.current || !transaction.docChanged) return;
      dirtyRef.current = true;
      if (pausedRef.current) return;
      setStatus("dirty");
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => flushRef.current(), AUTOSAVE_DELAY_MS);
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      setSelectionText(from === to ? "" : editor.state.doc.textBetween(from, to, " ").trim().slice(0, 200));
    },
  });

  /** Replaces the editor content without marking the document dirty. */
  const applyRemoteContent = useCallback(
    (content: string, version: number) => {
      if (!editor) return;
      applyingRemoteRef.current = true;
      editor.commands.setContent(content, { emitUpdate: false });
      applyingRemoteRef.current = false;
      versionRef.current = version;
      dirtyRef.current = false;
      pausedRef.current = false;
      setConflictBy(null);
      setStatus("saved");
    },
    [editor],
  );

  /**
   * The save loop. Only one request is in flight at a time; edits made while
   * saving mark the document dirty again and trigger a follow-up save, so a
   * slow response can never overwrite newer text.
   */
  const flush = useCallback(
    async (force = false) => {
      if (!editor || savingRef.current) return;
      if (!force && (!dirtyRef.current || pausedRef.current)) return;
      savingRef.current = true;
      dirtyRef.current = false;
      setStatus("saving");
      try {
        const { document } = await api<{ document: { version: number } }>(docUrl, {
          method: "PATCH",
          json: { content: editor.getHTML(), baseVersion: versionRef.current, force },
        });
        versionRef.current = document.version;
        pausedRef.current = false;
        setConflictBy(null);
        setErrorMessage(null);
        setStatus(dirtyRef.current ? "dirty" : "saved");
      } catch (e) {
        dirtyRef.current = true;
        if (e instanceof ApiError && e.status === 409) {
          pausedRef.current = true;
          setConflictBy(String(e.data.updatedByName ?? "Someone"));
          setStatus("conflict");
        } else if (e instanceof ApiError && e.status === 403) {
          pausedRef.current = true;
          setErrorMessage(e.message);
          setStatus("error");
        } else {
          setErrorMessage((e as Error).message);
          setStatus("error");
        }
      } finally {
        savingRef.current = false;
      }
      if (dirtyRef.current && !pausedRef.current) {
        if (timerRef.current) clearTimeout(timerRef.current);
        // After a failure, back off before retrying automatically.
        timerRef.current = setTimeout(() => flushRef.current(), 4 * AUTOSAVE_DELAY_MS);
      }
    },
    [editor, docUrl],
  );
  useEffect(() => {
    flushRef.current = flush;
  }, [flush]);

  /** Manual retry after a failed save. Never forces: a conflict still surfaces as a conflict. */
  const retry = () => {
    pausedRef.current = false;
    flush();
  };

  const loadLatest = useCallback(async () => {
    try {
      const { document } = await api<{ document: { content: string; version: number; title: string } }>(docUrl);
      applyRemoteContent(document.content, document.version);
      setTitle(document.title);
      savedTitleRef.current = document.title;
    } catch (e) {
      setErrorMessage((e as Error).message);
    }
  }, [docUrl, applyRemoteContent]);

  // Keep the editor's read-only state in step with the user's current role.
  useEffect(() => {
    editor?.setEditable(editable, false); // false: switching modes is not an edit
  }, [editor, editable]);

  // Heartbeat: presence, role changes, renames and remote edits.
  useEffect(() => {
    if (!editor || lostAccess) return;
    let cancelled = false;
    async function beat() {
      try {
        const hb = await api<Heartbeat>(`${docUrl}/presence`, { method: "POST" });
        if (cancelled) return;
        setOthers(hb.others);
        setAccess(hb.access);
        if (!titleFocusedRef.current && hb.title !== savedTitleRef.current) {
          savedTitleRef.current = hb.title;
          setTitle(hb.title);
        }
        const clean = !dirtyRef.current && !savingRef.current && !pausedRef.current;
        if (hb.version > versionRef.current && clean) {
          await loadLatest();
          if (!cancelled && hb.updatedBy !== user.id) setNotice(`${hb.updatedByName} updated this document.`);
        }
      } catch (e) {
        if (cancelled) return;
        if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
          setLostAccess(
            e.status === 404 ? "This document was deleted." : "Your access to this document was removed.",
          );
        }
      }
    }
    beat();
    const t = setInterval(beat, HEARTBEAT_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [editor, docUrl, lostAccess, loadLatest, user.id]);

  // Leave presence and flush pending edits when the tab closes or the page changes.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current || savingRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      if (timerRef.current) clearTimeout(timerRef.current);
      flushRef.current();
      api(`${docUrl}/presence`, { method: "DELETE", keepalive: true }).catch(() => {});
    };
  }, [docUrl]);

  // Comments are loaded here (not in the panel) so the header can show the open count.
  const refreshComments = useCallback(async () => {
    try {
      setComments((await api<{ comments: CommentEntry[] }>(`${docUrl}/comments`)).comments);
    } catch {
      /* the heartbeat reports lost access; a failed refresh is retried on the next tick */
    }
  }, [docUrl]);
  useEffect(() => {
    if (lostAccess) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the request resolves
    refreshComments();
    const t = setInterval(refreshComments, 8000);
    return () => clearInterval(t);
  }, [refreshComments, lostAccess]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  async function commitTitle() {
    titleFocusedRef.current = false;
    const next = title.trim();
    if (!next) {
      setTitle(savedTitleRef.current); // an empty title is never saved
      return;
    }
    setTitle(next);
    if (next === savedTitleRef.current) return;
    try {
      await api(docUrl, { method: "PATCH", json: { title: next } });
      savedTitleRef.current = next;
    } catch (e) {
      setTitle(savedTitleRef.current);
      setErrorMessage(`Couldn't rename: ${(e as Error).message}`);
    }
  }

  const openComments = comments.filter((c) => !c.resolved).length;

  return (
    <div className="editor-shell">
      <title>{`${title.trim() || "Untitled document"} – Ajaia Docs`}</title>
      <header className="editor-header no-print">
        <div className="editor-header-row">
          <Link href="/" className="brand-mark" title="Back to documents" aria-label="Back to documents">
            A
          </Link>
          <div className="title-block">
            <input
              className="title-input"
              value={title}
              readOnly={!editable}
              maxLength={200}
              aria-label="Document title"
              onFocus={() => (titleFocusedRef.current = true)}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={(e) => {
                if (e.key === "Enter") e.currentTarget.blur();
                if (e.key === "Escape") {
                  setTitle(savedTitleRef.current);
                  requestAnimationFrame(() => (document.activeElement as HTMLElement | null)?.blur());
                }
              }}
            />
            <div className="title-meta">
              <span className={`badge ${access === "owner" ? "badge-owner" : "badge-shared"}`}>
                {access === "owner" ? "Owner" : `${ACCESS_LABEL[access]} · shared by ${ownerName}`}
              </span>
              {editable ? (
                <span className={`save-status save-${status}`} role="status">
                  {STATUS_TEXT[status]}
                  {status === "error" && (
                    <button className="link-btn" onClick={retry}>
                      Retry
                    </button>
                  )}
                </span>
              ) : (
                <span className="save-status">Read only</span>
              )}
            </div>
          </div>

          <div className="header-actions">
            {others.length > 0 && (
              <div className="presence" aria-label="Also viewing">
                {others.map((o) => (
                  <Avatar key={o.id} name={`${o.name} is here`} color={o.color} />
                ))}
              </div>
            )}
            <button
              className={`btn ${panel === "comments" ? "btn-active" : ""}`}
              onClick={() => setPanel(panel === "comments" ? null : "comments")}
            >
              Comments{openComments > 0 && <span className="count">{openComments}</span>}
            </button>
            <button
              className={`btn ${panel === "history" ? "btn-active" : ""}`}
              onClick={() => setPanel(panel === "history" ? null : "history")}
            >
              History
            </button>
            <details className="menu">
              <summary className="btn">Export</summary>
              <div className="menu-items">
                <a href={`${docUrl}/export`} download>
                  Markdown (.md)
                </a>
                <button
                  onClick={(e) => {
                    (e.currentTarget.closest("details") as HTMLDetailsElement).open = false;
                    window.print();
                  }}
                >
                  PDF (print dialog)
                </button>
              </div>
            </details>
            <button className="btn btn-primary" onClick={() => setShareOpen(true)}>
              Share
            </button>
            <UserMenu user={user} />
          </div>
        </div>
        {editable && editor && <Toolbar editor={editor} />}
      </header>

      {status === "conflict" && (
        <div className="banner banner-warn no-print" role="alert">
          <span>
            <strong>{conflictBy}</strong> changed this document while you were editing, so your latest edits are not
            saved yet.
          </span>
          <button className="btn" onClick={loadLatest}>
            Discard mine, load theirs
          </button>
          <button className="btn btn-primary" onClick={() => flush(true)}>
            Keep mine
          </button>
        </div>
      )}
      {errorMessage && status !== "conflict" && (
        <div className="banner banner-error no-print" role="alert">
          <span>{errorMessage}</span>
          <button className="link-btn" onClick={() => setErrorMessage(null)}>
            Dismiss
          </button>
        </div>
      )}
      {!canEdit(access) && !lostAccess && (
        <div className="banner no-print">
          {canComment(access)
            ? "You can read and comment on this document, but not edit it."
            : "You have view-only access to this document."}
        </div>
      )}

      <div className="editor-body">
        <main className="page-wrap">
          <article className="page">
            <h1 className="print-title">{title}</h1>
            <EditorContent editor={editor} />
            {!editor && <div className="doc-content muted">Loading editor…</div>}
          </article>
        </main>

        {panel === "comments" && (
          <CommentsPanel
            docUrl={docUrl}
            user={user}
            access={access}
            comments={comments}
            selectionText={selectionText}
            onChange={setComments}
            onClose={() => setPanel(null)}
          />
        )}
        {panel === "history" && (
          <HistoryPanel
            docUrl={docUrl}
            canRestore={editable}
            onRestored={(doc) => {
              applyRemoteContent(doc.content, doc.version);
              setNotice("Version restored.");
            }}
            onClose={() => setPanel(null)}
          />
        )}
      </div>

      {shareOpen && (
        <ShareDialog docUrl={docUrl} canManage={canManage(access)} onClose={() => setShareOpen(false)} />
      )}
      {notice && (
        <div className="toast no-print" role="status">
          {notice}
        </div>
      )}
      {lostAccess && (
        <div className="overlay no-print">
          <div className="dialog" role="alertdialog" aria-label="Access lost">
            <h2>{lostAccess}</h2>
            <p className="muted">You can no longer view or edit it.</p>
            <Link href="/" className="btn btn-primary">
              Back to documents
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
