import mammoth from "mammoth";
import { marked } from "marked";
import { HttpError } from "./http";
import { escapeHtml, sanitizeContent } from "./sanitize";

export const IMPORT_EXTENSIONS = [".txt", ".md", ".docx"] as const;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;

export interface ImportedFile {
  title: string;
  html: string;
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

/** Plain text: blank lines separate paragraphs, single newlines become line breaks. */
function textToHtml(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

/**
 * Converts an uploaded file into a document title + sanitized HTML.
 * Throws HttpError(400/413) with a user-facing message for anything unsupported.
 */
export async function convertUpload(filename: string, data: Buffer): Promise<ImportedFile> {
  const ext = extensionOf(filename);
  if (!(IMPORT_EXTENSIONS as readonly string[]).includes(ext)) {
    throw new HttpError(400, `Unsupported file type. Supported types: ${IMPORT_EXTENSIONS.join(", ")}.`);
  }
  if (data.byteLength === 0) throw new HttpError(400, "That file is empty.");
  if (data.byteLength > IMPORT_MAX_BYTES) {
    throw new HttpError(413, "That file is too large. The limit is 2 MB.");
  }

  let html: string;
  if (ext === ".docx") {
    try {
      html = (await mammoth.convertToHtml({ buffer: data })).value;
    } catch {
      throw new HttpError(400, "That .docx file could not be read. It may be corrupted.");
    }
  } else {
    const text = data.toString("utf8").replace(/^﻿/, "");
    if (text.includes("\u0000")) throw new HttpError(400, "That file does not look like text.");
    html = ext === ".md" ? await marked.parse(text) : textToHtml(text);
  }

  const title =
    filename
      .slice(0, filename.length - ext.length)
      .replace(/[\\/]/g, " ")
      .trim()
      .slice(0, 200) || "Imported document";
  return { title, html: sanitizeContent(html) };
}
