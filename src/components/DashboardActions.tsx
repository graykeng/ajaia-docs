"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { api } from "@/lib/api";

const ACCEPT = ".txt,.md,.docx";
const MAX_BYTES = 2 * 1024 * 1024;

export function DashboardActions() {
  const router = useRouter();
  const fileInput = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState<"create" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function createDocument() {
    setBusy("create");
    setError(null);
    try {
      const { document } = await api<{ document: { id: string } }>("/api/documents", { json: {} });
      router.push(`/docs/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  async function importFile(file: File) {
    setError(null);
    // Validate before uploading so the user gets an instant answer; the server checks again.
    if (!ACCEPT.split(",").some((ext) => file.name.toLowerCase().endsWith(ext))) {
      setError(`"${file.name}" is not supported. Choose a .txt, .md or .docx file.`);
      return;
    }
    if (file.size > MAX_BYTES) {
      setError(`"${file.name}" is too large. The limit is 2 MB.`);
      return;
    }
    setBusy("import");
    try {
      const form = new FormData();
      form.set("file", file);
      const { document } = await api<{ document: { id: string } }>("/api/documents/import", { body: form });
      router.push(`/docs/${document.id}`);
    } catch (e) {
      setError((e as Error).message);
      setBusy(null);
    }
  }

  return (
    <div className="dash-actions">
      <div className="dash-buttons">
        <button className="btn btn-primary" onClick={createDocument} disabled={busy !== null}>
          {busy === "create" ? "Creating…" : "+ New document"}
        </button>
        <button className="btn" onClick={() => fileInput.current?.click()} disabled={busy !== null}>
          {busy === "import" ? "Importing…" : "Import file"}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT}
          hidden
          aria-label="Import file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) importFile(file);
          }}
        />
        <span className="muted hint">Import turns a .txt, .md or .docx file (up to 2 MB) into a new document.</span>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
    </div>
  );
}

export function DeleteDocumentButton({ id, title }: { id: string; title: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  async function remove() {
    if (!window.confirm(`Delete "${title}"? This removes it for everyone and cannot be undone.`)) return;
    setBusy(true);
    try {
      await api(`/api/documents/${id}`, { method: "DELETE" });
      router.refresh();
    } catch (e) {
      window.alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <button className="btn btn-ghost btn-danger" onClick={remove} disabled={busy} aria-label={`Delete ${title}`}>
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
