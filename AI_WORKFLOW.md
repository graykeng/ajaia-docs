# AI workflow note

## Tools used

- **Claude Code** (model: Claude Fable 5.2) in the Claude desktop app, as the single AI tool for planning, implementation, tests, verification and documentation.

## How the work was divided

I set the direction and constraints; Claude did the implementation inside them.

- I supplied the brief and asked for a step-by-step plan before any code was written.
- I made the scope and infrastructure calls: build every optional stretch item, deploy on Cloudflare (not the Vercel setup Claude first proposed), use my own GitHub repository and domain, and commit after each small piece of work.
- Claude wrote the code, the tests and the first draft of these documents, ran the checks, and tested the running app in a browser.

## Where AI materially sped up the work

- **Scoping.** Turning the brief into a prioritized build order and an explicit cut list took minutes and gave me something concrete to push back on.
- **Boilerplate with consistent structure.** Schema, seed data, thirteen API routes, validation schemas and a shared route wrapper for auth and error handling.
- **The test suite.** 37 tests, including the full permission matrix and API tests that call the real route handlers against an in-memory database.
- **Adapting to a changed deployment target.** When I switched hosting to Cloudflare mid-build, the database had to change. Because data access was already behind a small interface, the switch to D1 touched one file.
- **Verification.** Claude drove the app in a browser (create, format, rename, reload, share, comment, restore a version, view as a second user) and then re-ran the main flows against the real Cloudflare Workers runtime locally.

## What was changed or rejected

- **Hosting and database plan, twice.** Claude's first plan was Vercel + Postgres + Prisma. It then moved to a plain SQL client with a local SQLite file to remove setup for reviewers. I then required Cloudflare, which led to the final design: D1 behind a two-method database interface.
- **Framework defaults.** The generated project enabled experimental caching options and a Google-hosted font. Both were removed: every page here is per-user and dynamic, and the build should not depend on a third-party font download.
- **A real bug found by using the app, not by tests.** Opening a document triggered a save even when nothing was typed, because the editor library reports "became editable" as an update. This bumped the version on every open and could show a false conflict banner. It was only visible in the browser; the fix was to count only transactions that change the document as edits.
- **A wrong "Retry" behaviour.** The first version of the retry button forced the save, which would have overwritten another person's changes after a conflict. It now retries normally so a conflict still surfaces as a conflict.
- **A bad test.** One test meant to check an anonymous upload was signing in as Alice because of a default argument. It failed, was diagnosed as a test mistake, and rewritten. That fix was briefly committed while still failing because of a shell command chain error; it was corrected in the next commit rather than hidden.
- **Lint rule exceptions, stated not silenced.** Three places fetch data when a component mounts, which a new React lint rule flags. Each exception has an inline comment explaining why it is safe.
- **Export quality.** The first Markdown export produced loose, oddly spaced lists from editor content. It was fixed and a test added.
- **Features rejected outright:** websocket/CRDT co-editing, real authentication, text-anchored comments, and server-side PDF generation. Reasons are in [ARCHITECTURE.md](ARCHITECTURE.md).

## How correctness, UX and reliability were verified

- **Automated:** `npm test` (37 tests), `npm run typecheck`, `npm run lint` and `npm run build` all pass.
- **In the browser, on the dev server:** the full flow as Alice, then as Carol with viewer access. Confirmed that formatting survives reload, that an unknown email in the share dialog gives a clear error, that a viewer sees no toolbar and cannot type, and that the API rejects a viewer's write with 403 even when called directly.
- **On the Cloudflare Workers runtime (local):** sign-in, import of `.txt`, `.md` and `.docx`, save with sanitization, Markdown export, sharing, role enforcement, presence and version history. This mattered because several libraries (Word import, HTML sanitizing) were not guaranteed to run outside Node.
- **Bundle size** checked with a deploy dry run: 1.7 MB compressed, within Cloudflare's free-plan limit.

## What was not verified

- There are no automated browser tests; editor behaviour was checked by hand.
- Two people editing at the same time was tested at the API level and by simulating a stale save, not with two live browsers.
- The print-to-PDF output was not inspected visually.
