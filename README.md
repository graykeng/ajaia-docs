# Ajaia Docs

A lightweight collaborative document editor: create and format documents in the browser, import files, share them with other users at different permission levels, comment, and roll back to earlier versions.

- **Live app:** https://ajaia-docs.graykeng7.workers.dev
- **Walkthrough video:** see [video-url.txt](video-url.txt)
- **Architecture note:** [ARCHITECTURE.md](ARCHITECTURE.md)
- **AI workflow note:** [AI_WORKFLOW.md](AI_WORKFLOW.md)

## Test accounts

The app uses seeded accounts instead of passwords. On the sign-in page, click the user you want to be.

| User | Email | Starts with |
| --- | --- | --- |
| Alice Chen | `alice@ajaia.test` | Owns "Welcome to Ajaia Docs" |
| Bob Martinez | `bob@ajaia.test` | Editor on Alice's welcome document |
| Carol Singh | `carol@ajaia.test` | Nothing; no access to the welcome document |

To see two users at once, sign in as the second user in a private window or another browser profile.

## What it does

| Area | Behaviour |
| --- | --- |
| Editing | Rich text with bold, italic, underline, strikethrough, three heading levels, bulleted and numbered lists, block quotes, undo/redo. Keyboard shortcuts work (⌘/Ctrl+B, I, U, Z). |
| Saving | Autosaves about a second after you stop typing, with a visible status. Reopening or refreshing shows the same formatted content. |
| Renaming | Click the title in the editor and type. Empty titles are rejected. |
| File import | **Import file** on the dashboard turns a `.txt`, `.md` or `.docx` file (up to 2 MB) into a new editable document. Other types are rejected with a message. Sample files are in [`samples/`](samples). |
| Sharing | The owner shares by email with a role: **Viewer** (read), **Commenter** (read and comment) or **Editor** (read, comment, edit). Roles can be changed or revoked. Only the owner can share or delete. |
| Owned vs shared | The dashboard has separate "Owned by me" and "Shared with me" sections, with owner and role badges. |
| Presence | Avatars in the editor header show who else has the document open. Changes saved by someone else appear within a few seconds. |
| Conflicts | If two people edit at once, the second save is not silently lost or overwritten: the editor shows a banner and lets you keep your version or load theirs. |
| Comments | A side panel for comments, optionally quoting the selected text. Comments can be resolved, reopened and deleted. |
| Version history | Each editing session is stored as a version. Any version can be previewed and restored; restoring adds a new version rather than deleting history. |
| Export | Download as Markdown, or use **Export → PDF** to print the document to PDF without the app chrome. |

### Supported file types for import

Only `.txt`, `.md` and `.docx`, up to 2 MB. This is stated in the UI next to the import button and enforced on both client and server. Headings, bold/italic/underline, lists, quotes and links are preserved; images, tables and custom styling are dropped because the editor does not support them.

## Run locally

Requirements: Node.js 22 or newer (developed on Node 24).

```bash
npm install
npm run dev
```

Open http://localhost:3000. There is nothing else to set up: the database is a local SQLite file (Cloudflare D1 emulation under `.wrangler/`), and the schema and seed users are created on first request.

To reset local data, stop the server and delete the `.wrangler/` folder.

### Other commands

| Command | What it does |
| --- | --- |
| `npm test` | Runs the automated tests (Vitest, 37 tests) |
| `npm run typecheck` | TypeScript check |
| `npm run lint` | ESLint |
| `npm run build` | Next.js production build |
| `npm run preview` | Builds and runs the app on the real Cloudflare Workers runtime locally (http://localhost:8787) |
| `npm run deploy` | Builds and deploys to Cloudflare Workers |

## Automated tests

`npm test` runs three suites against an in-memory SQLite database, with no server or browser needed:

- `tests/access.test.ts` – the full permission matrix (owner / editor / commenter / viewer / none).
- `tests/importFile.test.ts` – `.txt`, `.md` and `.docx` conversion, rejection of bad uploads, HTML sanitization, Markdown export.
- `tests/api.test.ts` – the real route handlers end to end: sign-in, create/rename/save/reopen, validation, sharing and role enforcement, revocation, save conflicts, file import, comments, version history and restore, presence, export.

## Deploy (Cloudflare Workers + D1)

The app is built for Cloudflare Workers using the OpenNext adapter, with Cloudflare D1 as the database. Everything fits in Cloudflare's free plan.

```bash
npx wrangler login
npx wrangler d1 create ajaia-docs        # copy the printed database_id into wrangler.jsonc
npm run deploy
npx wrangler secret put SESSION_SECRET   # any long random string; signs the session cookie
```

The schema and seed data are created automatically on the first request.

## Project layout

```
src/app/                 Pages (login, dashboard, editor) and API routes
src/components/          Editor, toolbar, share dialog, comments and history panels
src/lib/access.ts        Permission rules (pure functions)
src/lib/documents.ts     All document behaviour and access enforcement
src/lib/importFile.ts    File upload conversion
src/lib/sanitize.ts      HTML allowlist applied to everything stored
src/lib/db.ts            Database interface, schema and seed data
tests/                   Vitest suites and helpers
samples/                 Example files to import
```

## Known limitations

- **Not real-time co-editing.** Two people typing in the same document at the same moment get conflict detection, not merged cursors. When someone else's save arrives and you have no unsaved edits, the document refreshes in place (and your cursor position resets).
- **Mock authentication.** Anyone can sign in as any seeded user. This is deliberate for review and is not suitable for real data.
- **Comments are not anchored.** A comment stores a copy of the quoted text; it does not highlight or follow that text in the document.
- **PDF export uses the browser's print dialog** rather than generating a file on the server.
- **No images or tables** in the editor, so imports drop them.
- **No search, folders or pagination** on the dashboard.
- **Version history** keeps the latest 50 versions per document and groups saves by one author within ten minutes into one version.

See [ARCHITECTURE.md](ARCHITECTURE.md) for why these were cut and what would come next.
