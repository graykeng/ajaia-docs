/* eslint-disable @typescript-eslint/no-explicit-any -- test assertions read untyped JSON responses */
import { beforeEach, describe, expect, it } from "vitest";
import * as session from "@/app/api/session/route";
import * as documents from "@/app/api/documents/route";
import * as importRoute from "@/app/api/documents/import/route";
import * as document from "@/app/api/documents/[id]/route";
import * as shares from "@/app/api/documents/[id]/shares/route";
import * as share from "@/app/api/documents/[id]/shares/[userId]/route";
import * as comments from "@/app/api/documents/[id]/comments/route";
import * as comment from "@/app/api/documents/[id]/comments/[commentId]/route";
import * as versions from "@/app/api/documents/[id]/versions/route";
import * as version from "@/app/api/documents/[id]/versions/[versionId]/route";
import * as presence from "@/app/api/documents/[id]/presence/route";
import * as exportRoute from "@/app/api/documents/[id]/export/route";
import { ALICE, BOB, CAROL, call } from "./helpers/request";
import { useFreshDb } from "./helpers/testDb";

beforeEach(useFreshDb);

async function createDoc(as: string, title?: string): Promise<string> {
  const res = await call(documents.POST, { as, json: title ? { title } : {} });
  expect(res.status).toBe(201);
  return res.data.document.id;
}
const shareWith = (id: string, email: string, role: string, as = ALICE) =>
  call(shares.POST, { as, params: { id }, json: { email, role } });
const save = (id: string, as: string, json: object) =>
  call(document.PATCH, { as, method: "PATCH", params: { id }, json });

describe("session", () => {
  it("signs in a seeded user and rejects unknown users", async () => {
    const ok = await call(session.POST, { json: { userId: ALICE } });
    expect(ok.status).toBe(200);
    expect(ok.headers.get("set-cookie")).toMatch(/ajaia_session=.+HttpOnly/);
    expect((await call(session.POST, { json: { userId: "u_mallory" } })).status).toBe(404);
  });

  it("rejects anonymous and forged sessions", async () => {
    expect((await call(documents.GET)).status).toBe(401);
    const forged = new Request("http://test.local/api", { headers: { cookie: "ajaia_session=u_alice.forged" } });
    expect((await documents.GET(forged, { params: Promise.resolve({}) })).status).toBe(401);
  });
});

describe("documents", () => {
  it("creates, renames, saves and reopens a document with formatting intact", async () => {
    const id = await createDoc(ALICE);
    expect((await save(id, ALICE, { title: "Roadmap" })).status).toBe(200);
    const html = "<h1>Roadmap</h1><p><strong>Bold</strong>, <em>italic</em>, <u>underline</u></p><ul><li>One</li></ul>";
    expect((await save(id, ALICE, { content: html, baseVersion: 1 })).data.document.version).toBe(2);

    const reopened = await call(document.GET, { as: ALICE, params: { id } });
    expect(reopened.data.document).toMatchObject({ title: "Roadmap", content: html, version: 2 });
    expect(reopened.data.access).toBe("owner");
  });

  it("validates input", async () => {
    const id = await createDoc(ALICE);
    expect((await save(id, ALICE, { title: "   " })).status).toBe(400);
    expect((await save(id, ALICE, { title: "x".repeat(201) })).status).toBe(400);
    expect((await save(id, ALICE, {})).status).toBe(400);
    expect((await call(document.GET, { as: ALICE, params: { id: "d_missing" } })).status).toBe(404);
  });

  it("sanitizes saved content", async () => {
    const id = await createDoc(ALICE);
    const res = await save(id, ALICE, { content: '<p onclick="x()">hi</p><script>alert(1)</script>' });
    expect(res.data.document.content).toBe("<p>hi</p>");
  });

  it("detects conflicting saves instead of silently overwriting", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "editor");
    expect((await save(id, ALICE, { content: "<p>Alice</p>", baseVersion: 1 })).status).toBe(200);

    const stale = await save(id, BOB, { content: "<p>Bob</p>", baseVersion: 1 });
    expect(stale.status).toBe(409);
    expect(stale.data).toMatchObject({ version: 2, updatedByName: "Alice Chen" });

    const forced = await save(id, BOB, { content: "<p>Bob</p>", baseVersion: 1, force: true });
    expect(forced.data.document).toMatchObject({ content: "<p>Bob</p>", version: 3 });
  });
});

describe("sharing and access control", () => {
  it("separates owned from shared documents", async () => {
    const id = await createDoc(ALICE, "Alice's plan");
    await shareWith(id, "carol@ajaia.test", "viewer");

    const alice = (await call(documents.GET, { as: ALICE })).data;
    expect(alice.owned.map((d: any) => d.title)).toContain("Alice's plan");
    expect(alice.owned.find((d: any) => d.id === id).shareCount).toBe(1);

    const carol = (await call(documents.GET, { as: CAROL })).data;
    expect(carol.owned).toEqual([]);
    expect(carol.shared).toEqual([expect.objectContaining({ id, access: "viewer", ownerName: "Alice Chen" })]);
  });

  it("blocks users the document is not shared with", async () => {
    const id = await createDoc(ALICE);
    expect((await call(document.GET, { as: CAROL, params: { id } })).status).toBe(403);
    expect((await save(id, CAROL, { content: "<p>x</p>" })).status).toBe(403);
    expect((await call(comments.GET, { as: CAROL, params: { id } })).status).toBe(403);
    expect((await call(versions.GET, { as: CAROL, params: { id } })).status).toBe(403);
    expect((await call(exportRoute.GET, { as: CAROL, params: { id } })).status).toBe(403);
    expect((await call(presence.POST, { as: CAROL, method: "POST", params: { id } })).status).toBe(403);
  });

  it("enforces viewer, commenter and editor roles", async () => {
    const id = await createDoc(ALICE);

    await shareWith(id, "bob@ajaia.test", "viewer");
    expect((await call(document.GET, { as: BOB, params: { id } })).data.access).toBe("viewer");
    expect((await save(id, BOB, { content: "<p>x</p>" })).status).toBe(403);
    expect((await call(comments.POST, { as: BOB, params: { id }, json: { body: "hi" } })).status).toBe(403);

    await shareWith(id, "bob@ajaia.test", "commenter"); // re-sharing changes the role
    expect((await call(comments.POST, { as: BOB, params: { id }, json: { body: "hi" } })).status).toBe(201);
    expect((await save(id, BOB, { content: "<p>x</p>" })).status).toBe(403);

    await shareWith(id, "bob@ajaia.test", "editor");
    expect((await save(id, BOB, { content: "<p>x</p>" })).status).toBe(200);
    expect((await save(id, BOB, { title: "Bob renamed it" })).status).toBe(200);
  });

  it("keeps sharing and deletion with the owner", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "editor");
    expect((await shareWith(id, "carol@ajaia.test", "viewer", BOB)).status).toBe(403);
    expect((await call(document.DELETE, { as: BOB, method: "DELETE", params: { id } })).status).toBe(403);
    expect((await call(document.DELETE, { as: ALICE, method: "DELETE", params: { id } })).status).toBe(200);
    expect((await call(document.GET, { as: ALICE, params: { id } })).status).toBe(404);
  });

  it("validates share requests", async () => {
    const id = await createDoc(ALICE);
    expect((await shareWith(id, "nobody@ajaia.test", "viewer")).status).toBe(404);
    expect((await shareWith(id, "alice@ajaia.test", "viewer")).status).toBe(400);
    expect((await shareWith(id, "not-an-email", "viewer")).status).toBe(400);
    expect((await shareWith(id, "bob@ajaia.test", "admin")).status).toBe(400);
  });

  it("revokes access when a share is removed", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "editor");
    const res = await call(share.DELETE, { as: ALICE, method: "DELETE", params: { id, userId: BOB } });
    expect(res.data.shares).toEqual([]);
    expect((await call(document.GET, { as: BOB, params: { id } })).status).toBe(403);
  });

  it("ships a seeded document owned by Alice and shared with Bob", async () => {
    expect((await call(document.GET, { as: BOB, params: { id: "d_welcome" } })).data.access).toBe("editor");
    expect((await call(document.GET, { as: CAROL, params: { id: "d_welcome" } })).status).toBe(403);
  });
});

describe("file import", () => {
  const upload = (name: string, content: string, as = ALICE) => {
    const form = new FormData();
    form.set("file", new File([content], name));
    return call(importRoute.POST, { as, form });
  };

  it("turns an uploaded Markdown file into a new document owned by the uploader", async () => {
    const res = await upload("Launch plan.md", "# Launch\n\n- **Step one**\n- Step two");
    expect(res.status).toBe(201);
    expect(res.data.document).toMatchObject({ title: "Launch plan", ownerId: ALICE });
    expect(res.data.document.content).toContain("<h1>Launch</h1>");
    expect(res.data.document.content).toContain("<strong>Step one</strong>");
  });

  it("rejects unsupported files and missing uploads", async () => {
    expect((await upload("malware.exe", "MZ")).status).toBe(400);
    expect((await call(importRoute.POST, { as: ALICE, form: new FormData() })).status).toBe(400);
    const anonymous = new FormData();
    anonymous.set("file", new File(["hello"], "a.txt"));
    expect((await call(importRoute.POST, { form: anonymous })).status).toBe(401);
  });
});

describe("comments", () => {
  it("supports adding, resolving and deleting with ownership rules", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "commenter");
    await shareWith(id, "carol@ajaia.test", "commenter");

    const added = await call(comments.POST, { as: BOB, params: { id }, json: { body: " Tighten this ", quote: "intro" } });
    const [c] = added.data.comments;
    expect(c).toMatchObject({ body: "Tighten this", quote: "intro", authorName: "Bob Martinez", resolved: false });
    expect((await call(comments.POST, { as: BOB, params: { id }, json: { body: "  " } })).status).toBe(400);

    const params = { id, commentId: c.id };
    const resolved = await call(comment.PATCH, { as: ALICE, method: "PATCH", params, json: { resolved: true } });
    expect(resolved.data.comments[0].resolved).toBe(true);

    expect((await call(comment.DELETE, { as: CAROL, method: "DELETE", params })).status).toBe(403);
    expect((await call(comment.DELETE, { as: BOB, method: "DELETE", params })).data.comments).toEqual([]);
  });
});

describe("version history", () => {
  it("records versions per author and restores an earlier one", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "editor");
    await save(id, ALICE, { content: "<p>draft one</p>" });
    await save(id, ALICE, { content: "<p>draft two</p>" }); // same session: folds into one entry
    await save(id, BOB, { content: "<p>Bob's rewrite</p>" });

    const list = (await call(versions.GET, { as: ALICE, params: { id } })).data.versions;
    expect(list.map((v: any) => [v.authorName, v.label])).toEqual([
      ["Bob Martinez", null],
      ["Alice Chen", null],
      ["Alice Chen", "Created"],
    ]);

    const alicesVersion = list[1].id;
    const preview = await call(version.GET, { as: ALICE, params: { id, versionId: alicesVersion } });
    expect(preview.data.version.content).toBe("<p>draft two</p>");

    const restored = await call(version.POST, { as: ALICE, method: "POST", params: { id, versionId: alicesVersion } });
    expect(restored.data.document.content).toBe("<p>draft two</p>");
    expect((await call(document.GET, { as: BOB, params: { id } })).data.document.content).toBe("<p>draft two</p>");

    const after = (await call(versions.GET, { as: ALICE, params: { id } })).data.versions;
    expect(after).toHaveLength(4);
    expect(after[0].label).toMatch(/^Restored version from/);
  });

  it("does not let viewers restore", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "viewer");
    const [v] = (await call(versions.GET, { as: BOB, params: { id } })).data.versions;
    expect((await call(version.POST, { as: BOB, method: "POST", params: { id, versionId: v.id } })).status).toBe(403);
  });
});

describe("presence and export", () => {
  it("reports who else has the document open, and the current version", async () => {
    const id = await createDoc(ALICE);
    await shareWith(id, "bob@ajaia.test", "editor");
    const beat = (as: string) => call(presence.POST, { as, method: "POST", params: { id } });

    expect((await beat(ALICE)).data.others).toEqual([]);
    expect((await beat(BOB)).data.others.map((u: any) => u.name)).toEqual(["Alice Chen"]);
    await save(id, BOB, { content: "<p>new</p>" });
    expect((await beat(ALICE)).data).toMatchObject({ version: 2, updatedByName: "Bob Martinez", access: "owner" });

    await call(presence.DELETE, { as: BOB, method: "DELETE", params: { id } });
    expect((await beat(ALICE)).data.others).toEqual([]);
  });

  it("exports Markdown as a download", async () => {
    const id = await createDoc(ALICE, "Team Notes: Q4");
    await save(id, ALICE, { content: "<h2>Agenda</h2><ol><li>Budget</li></ol>" });
    const res = await call(exportRoute.GET, { as: ALICE, params: { id } });
    expect(res.headers.get("content-disposition")).toBe('attachment; filename="Team-Notes-Q4.md"');
    expect(res.data).toContain("# Team Notes: Q4");
    expect(res.data).toContain("## Agenda");
    expect(res.data).toMatch(/1\.\s+Budget/);
  });
});
