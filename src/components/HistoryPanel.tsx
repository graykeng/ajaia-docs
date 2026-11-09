"use client";

import { useCallback, useEffect, useState } from "react";
import type { VersionEntry } from "@/lib/documents";
import { api } from "@/lib/api";
import { LocalTime } from "./LocalTime";

interface Preview {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

interface Props {
  docUrl: string;
  canRestore: boolean;
  onRestored: (doc: { content: string; version: number }) => void;
  onClose: () => void;
}

export function HistoryPanel({ docUrl, canRestore, onRestored, onClose }: Props) {
  const [versions, setVersions] = useState<VersionEntry[] | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setVersions((await api<{ versions: VersionEntry[] }>(`${docUrl}/versions`)).versions);
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, [docUrl]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- fetch on mount; state is set after the request resolves
    refresh();
  }, [refresh]);

  async function open(id: string) {
    setError(null);
    try {
      setPreview((await api<{ version: Preview }>(`${docUrl}/versions/${id}`)).version);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function restore() {
    if (!preview) return;
    setBusy(true);
    try {
      const { document } = await api<{ document: { content: string; version: number } }>(
        `${docUrl}/versions/${preview.id}`,
        { method: "POST" },
      );
      onRestored(document);
      setPreview(null);
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="side-panel no-print" aria-label="Version history">
      <div className="panel-head">
        <h2>Version history</h2>
        <button className="btn btn-ghost" onClick={onClose} aria-label="Close history">
          ✕
        </button>
      </div>
      <p className="muted hint">
        A version is saved for each editing session. Restoring adds a new version, so nothing is lost.{" "}
        <button className="link-btn" onClick={refresh}>
          Refresh
        </button>
      </p>
      {error && <p className="error-text" role="alert">{error}</p>}
      {!versions ? (
        <p className="muted">Loading…</p>
      ) : (
        <ul className="versions">
          {versions.map((v, i) => (
            <li key={v.id}>
              <button onClick={() => open(v.id)}>
                <strong>
                  <LocalTime ts={v.updatedAt} />
                  {i === 0 && <span className="badge">Current</span>}
                </strong>
                <small>
                  {v.label ?? "Edited"} · {v.authorName}
                </small>
              </button>
            </li>
          ))}
        </ul>
      )}

      {preview && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setPreview(null)}>
          <div className="dialog dialog-wide" role="dialog" aria-modal aria-label="Version preview">
            <div className="dialog-head">
              <h2>
                {preview.title} <small className="muted">· <LocalTime ts={preview.updatedAt} /></small>
              </h2>
              <button className="btn btn-ghost" onClick={() => setPreview(null)} aria-label="Close preview">
                ✕
              </button>
            </div>
            {/* Stored content is sanitized server-side on every write, so it is safe to render. */}
            <div className="doc-content preview" dangerouslySetInnerHTML={{ __html: preview.content || "<p><em>Empty document</em></p>" }} />
            <div className="dialog-foot">
              <button className="btn" onClick={() => setPreview(null)}>
                Close
              </button>
              {canRestore && (
                <button className="btn btn-primary" onClick={restore} disabled={busy}>
                  {busy ? "Restoring…" : "Restore this version"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
