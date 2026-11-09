import { exportMarkdown } from "@/lib/documents";
import { authed } from "@/lib/route";

/** Download the document as Markdown. (PDF export uses the browser's print dialog.) */
export const GET = authed<{ id: string }>(async (_req, user, { id }) => {
  const { filename, markdown } = await exportMarkdown(user, id);
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});
