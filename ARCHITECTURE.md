# Architecture note

## What was prioritized

1. **A coherent core loop.** Sign in, create or import a document, format it, share it, and see it from the other user's side. Every step of that loop works end to end and is covered by tests.
2. **Access control that is correct and testable.** Sharing is the part of this product where bugs are most costly, so permissions are enforced in one place on the server and tested as a full matrix.
3. **Not losing people's work.** Autosave with visible status, a save loop that cannot overwrite newer text with older text, and conflict detection when two people edit at once.
4. **Zero-friction review.** No accounts, no environment variables and no database setup locally; seeded users and a seeded shared document so sharing is visible immediately.

The optional stretch items (presence, comments, version history, export, roles) were added after the core was working and tested, each in its simplest useful form.

## Stack

| Layer | Choice | Reason |
| --- | --- | --- |
| App framework | Next.js 16 (App Router), TypeScript | UI and API in one deployable unit |
| Editor | TipTap 3 (ProseMirror) | Reliable rich-text behaviour and keyboard shortcuts without building an editor |
| Database | Cloudflare D1 (SQLite) | Free, no separate service, same SQL locally and in production |
| Hosting | Cloudflare Workers via OpenNext | Free, deploys with one command, supports a custom domain |
| Validation | Zod | One schema per request body, consistent error messages |
| Tests | Vitest | Fast; runs route handlers directly with no server |

## Structure

```
Browser (React + TipTap)
   │  fetch /api/...
   ▼
Route handlers  (src/app/api)        thin: parse, validate, call the service
   │
   ▼
Document service (src/lib/documents.ts)   every function takes the acting user,
   │                                      resolves access, then reads or writes
   ├── access.ts      pure permission rules
   ├── sanitize.ts    HTML allowlist
   ├── importFile.ts  .txt / .md / .docx → HTML
   ▼
Db interface (src/lib/db.ts)  →  D1 at runtime, in-memory SQLite in tests
```

Server-rendered pages (dashboard, editor shell) call the same service functions directly, so pages and API cannot disagree about who may see what.

## Key decisions

**Permissions live in one module.** `access.ts` maps a user and document to `owner | editor | commenter | viewer | none`, and answers `canView / canComment / canEdit / canManage`. The service's `load()` helper is the only way to fetch a document, and it requires the caller to state the permission needed. A route cannot forget a check because it never touches the database itself. The UI hides controls a user cannot use, but that is presentation only; the server is the authority.

**Content is stored as sanitized HTML.** The editor emits HTML, the importers produce HTML, and every write passes through one allowlist (`sanitize.ts`) that matches what the editor can represent. This keeps formatting intact across save and reload, makes imported files and typed content indistinguishable once stored, and means stored content is safe to render in previews. Storing editor JSON instead would tie the data to the editor library and need a second conversion path for imports.

**Saving: one request at a time, with optimistic concurrency.** Each document has a version number. A save sends the version it was based on; the server applies it only if that is still the current version (`UPDATE … WHERE version = ?`), otherwise it returns 409 and the editor asks the user what to do. On the client, only one save is in flight at a time, and edits made during a save trigger a follow-up save, so a slow response cannot clobber newer text. Renames do not bump the content version, so renaming never conflicts with typing.

**Presence and remote updates by polling.** Each open editor sends a heartbeat every four seconds and gets back who else is present, the current version, title and the caller's current role. That one cheap request drives presence avatars, picks up other people's saves, reflects renames, and reacts to role changes or revoked access while the document is open. Websockets and a CRDT would give true co-editing but are a much larger build; polling delivers the visible collaboration signals at a fraction of the cost.

**Version history as editing sessions.** Every save updates history, but consecutive saves by the same author within ten minutes update one entry instead of adding rows, so history reads as sessions rather than hundreds of autosaves. Restoring writes the old content as a new save, so a restore can itself be undone.

**Mock authentication, real session integrity.** Reviewers pick a seeded user; there are no passwords. The session cookie is HTTP-only and HMAC-signed, so the identity cannot be forged or changed from the client even though sign-in itself is open.

**The database sits behind a small interface.** `Db` has two methods (`execute`, `batch`). D1 implements it at runtime and Node's built-in SQLite implements it in tests, so the tests run the real SQL and the real route handlers without a server, emulator or mocks.

## Deliberately not built

| Cut | Why |
| --- | --- |
| Real-time co-editing (shared cursors, merged typing) | Needs a CRDT and persistent connections; the largest item on any docs roadmap and not achievable well in the timebox |
| Real sign-up, passwords, email invitations | The brief allows seeded users; real auth adds risk and review friction without showing more product judgment |
| Comments anchored to text ranges | Requires position mapping through edits; quoted-text comments capture most of the value |
| Suggestion mode | Depends on anchored ranges and a change-tracking model |
| Images, tables, fonts and colours | Each adds editor, storage and import/export work; the brief asks for basic formatting |
| Server-generated PDF | A headless browser does not fit the hosting model; print-to-PDF gives the same result for users |
| Folders, search, trash | Navigation features that matter at scale, not for demonstrating the core loop |
| Rate limiting and audit logging | Needed in production; out of scope for a review build |

## What I would build next (2–4 hours)

1. **Browser-level tests** (Playwright) for the editor: formatting, autosave, and the two-user conflict flow. The current tests cover the server thoroughly but the editor only through manual checks.
2. **Anchored comments** that highlight the quoted text and survive edits.
3. **Import into an existing document** and attaching files to a document.
4. **Real-time editing** with Yjs on a Cloudflare Durable Object, replacing the polling heartbeat.
5. **Real authentication** (magic-link email) and sharing with people who do not yet have an account.
