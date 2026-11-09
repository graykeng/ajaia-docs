# Submission contents

## Links

| Item | Location |
| --- | --- |
| Live app | https://ajaia-docs.graykeng7.workers.dev |
| Walkthrough video | https://youtu.be/oCmoDNcl12U (also in [video-url.txt](video-url.txt)) |
| Source repository | https://github.com/graykeng/ajaia-docs (the same source is in this folder) |

## Test accounts

No passwords. On the sign-in page, click a user.

| User | Email | Use it to |
| --- | --- | --- |
| Alice Chen | `alice@ajaia.test` | Own documents and share them |
| Bob Martinez | `bob@ajaia.test` | See a document shared with edit access |
| Carol Singh | `carol@ajaia.test` | See the "no access" state, then receive a share |

Suggested sharing check: sign in as Alice, open any document, click **Share**, add `carol@ajaia.test` as Viewer. In a private window sign in as Carol: the document appears under "Shared with me" and is read-only.

## Files in this folder

| File | Purpose |
| --- | --- |
| `README.md` | Features, test accounts, local setup, run and deploy instructions, limitations |
| `ARCHITECTURE.md` | What was prioritized, design decisions, what was cut and what comes next |
| `AI_WORKFLOW.md` | AI tools used, where they helped, what was changed or rejected, how the work was verified |
| `SUBMISSION.md` | This file |
| `video-url.txt` | Link to the walkthrough video |
| `src/` | Application source (pages, API routes, components, server logic) |
| `tests/` | Automated tests (`npm test`) |
| `samples/` | `sample.txt`, `sample.md`, `sample.docx` for trying file import |
| `scripts/` | Script that regenerates the sample `.docx` |
| `package.json`, `package-lock.json` | Dependencies and commands |
| `wrangler.jsonc`, `open-next.config.ts`, `next.config.ts` | Cloudflare Workers / D1 deployment configuration |
| `tsconfig.json`, `eslint.config.mjs`, `vitest.config.mts`, `.env.example` | Tooling configuration |

`node_modules/`, `.next/`, `.open-next/` and `.wrangler/` are build output or local data and are not included.

## Status

### Working end to end

- Create, rename, edit, autosave and reopen documents
- Rich text: bold, italic, underline, strikethrough, headings (3 levels), bulleted and numbered lists, quotes, undo/redo
- Import `.txt`, `.md`, `.docx` (up to 2 MB) as a new document
- Sharing by email with Viewer / Commenter / Editor roles; change role; revoke
- Dashboard split into "Owned by me" and "Shared with me"
- Persistence of documents, formatting, shares, comments and versions
- Validation and error handling on every API route and form
- 37 automated tests
- Stretch: presence indicators, comments, version history with restore, Markdown and PDF export, role-based permissions

### Partial

- **Real-time collaboration** is presence indicators plus near-real-time refresh and conflict detection, not simultaneous co-editing.
- **Comments** quote the selected text but are not anchored to it in the document.
- **PDF export** uses the browser's print dialog.
- **Authentication** is simulated with seeded users.

### With another 2–4 hours

1. Browser-level automated tests for the editor and the two-user flows
2. Comments anchored to and highlighted in the text
3. Import into an existing document, and file attachments
4. True real-time editing (Yjs on a Cloudflare Durable Object)
5. Real authentication and email invitations
