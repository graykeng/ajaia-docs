import Link from "next/link";
import { redirect } from "next/navigation";
import { ACCESS_LABEL } from "@/lib/access";
import { listDocuments, type DocumentSummary } from "@/lib/documents";
import { getCurrentUser } from "@/lib/session";
import { AppHeader } from "@/components/AppHeader";
import { DashboardActions, DeleteDocumentButton } from "@/components/DashboardActions";
import { LocalTime } from "@/components/LocalTime";

export const dynamic = "force-dynamic";

function DocumentRow({ doc }: { doc: DocumentSummary }) {
  const owned = doc.access === "owner";
  return (
    <li className="doc-row">
      <Link href={`/docs/${doc.id}`} className="doc-link">
        <span className="doc-icon" aria-hidden>📄</span>
        <span className="doc-title">{doc.title}</span>
      </Link>
      <span className="doc-meta">
        {owned ? (
          <>
            <span className="badge badge-owner">Owner</span>
            {doc.shareCount > 0 && (
              <span className="badge">Shared with {doc.shareCount}</span>
            )}
          </>
        ) : (
          <>
            <span className="badge badge-shared">Shared by {doc.ownerName}</span>
            <span className="badge">{ACCESS_LABEL[doc.access]}</span>
          </>
        )}
      </span>
      <span className="doc-time muted">
        <LocalTime ts={doc.updatedAt} />
      </span>
      <span className="doc-actions">{owned && <DeleteDocumentButton id={doc.id} title={doc.title} />}</span>
    </li>
  );
}

export default async function Dashboard() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { owned, shared } = await listDocuments(user);

  return (
    <>
      <AppHeader user={user} />
      <main className="dashboard">
        <DashboardActions />

        <section>
          <h2>Owned by me</h2>
          {owned.length === 0 ? (
            <p className="empty">You have no documents yet. Create one or import a file to get started.</p>
          ) : (
            <ul className="doc-list">
              {owned.map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Shared with me</h2>
          {shared.length === 0 ? (
            <p className="empty">Nothing has been shared with you yet.</p>
          ) : (
            <ul className="doc-list">
              {shared.map((d) => (
                <DocumentRow key={d.id} doc={d} />
              ))}
            </ul>
          )}
        </section>
      </main>
    </>
  );
}
