import sanitizeHtml from "sanitize-html";

/**
 * Document content is stored as HTML. Everything that reaches the database
 * (editor saves and file imports alike) passes through this allowlist, which
 * matches what the editor can represent. That keeps stored content safe to
 * render and stops imports from carrying markup the editor would drop anyway.
 */
export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, {
    allowedTags: [
      "p", "br", "strong", "b", "em", "i", "u", "s", "h1", "h2", "h3",
      "ul", "ol", "li", "blockquote", "code", "pre", "hr", "a",
    ],
    allowedAttributes: { a: ["href"] },
    allowedSchemes: ["http", "https", "mailto"],
    // The editor supports three heading levels; fold deeper ones into h3.
    transformTags: { h4: "h3", h5: "h3", h6: "h3" },
  }).trim();
}

export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
