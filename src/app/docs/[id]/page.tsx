import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getDocument } from "@/lib/documents";
import { HttpError } from "@/lib/http";
import { getCurrentUser } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { DocumentEditor } from "@/components/DocumentEditor";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const user = await getCurrentUser();
  if (!user) return {};
  try {
    const { doc } = await getDocument(user, (await params).id);
    return { title: `${doc.title} – Ajaia Docs` };
  } catch {
    return {}; // no access or not found: fall back to the default title
  }
}

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { id } = await params;

  let loaded: Awaited<ReturnType<typeof getDocument>>;
  try {
    loaded = await getDocument(user, id);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    return (
      <>
        <AppHeader user={user} />
        <main className="blocked">
          <h1>{e.status === 404 ? "Document not found" : "You don't have access"}</h1>
          <p className="muted">
            {e.status === 404
              ? "This document may have been deleted."
              : `You are signed in as ${user.name}. Ask the owner to share this document with ${user.email}.`}
          </p>
          <Link href="/" className="btn btn-primary">
            Back to documents
          </Link>
        </main>
      </>
    );
  }

  const { doc, access, ownerName } = loaded;
  return (
    <DocumentEditor
      user={user}
      initial={{ id: doc.id, title: doc.title, content: doc.content, version: doc.version }}
      initialAccess={access}
      ownerName={ownerName}
    />
  );
}
