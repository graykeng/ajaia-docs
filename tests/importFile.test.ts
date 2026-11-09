import { describe, expect, it } from "vitest";
import { convertUpload, IMPORT_MAX_BYTES } from "@/lib/importFile";
import { htmlToMarkdown } from "@/lib/documents";
import { sanitizeContent } from "@/lib/sanitize";
import { buildDocx } from "./helpers/docx";

describe("convertUpload", () => {
  it("turns plain text into paragraphs and escapes markup", async () => {
    const out = await convertUpload("Meeting notes.txt", Buffer.from("First line\nsecond line\n\nNext <b>para</b>"));
    expect(out.title).toBe("Meeting notes");
    expect(out.html).toBe("<p>First line<br />second line</p>\n<p>Next &lt;b&gt;para&lt;/b&gt;</p>");
  });

  it("converts Markdown structure into editor formatting", async () => {
    const md = "# Plan\n\nSome **bold** and *italic* text.\n\n- one\n- two\n\n1. first\n2. second\n\n#### Deep heading";
    const { title, html } = await convertUpload("plan.md", Buffer.from(md));
    expect(title).toBe("plan");
    expect(html).toContain("<h1>Plan</h1>");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<em>italic</em>");
    expect(html).toMatch(/<ul>\s*<li>one<\/li>/);
    expect(html).toMatch(/<ol>\s*<li>first<\/li>/);
    expect(html).toContain("<h3>Deep heading</h3>"); // h4+ folds into h3
  });

  it("strips scripts and event handlers from imported Markdown", async () => {
    const { html } = await convertUpload("x.md", Buffer.from('Hi <script>alert(1)</script><img src=x onerror="alert(1)"> [l](javascript:alert(1))'));
    expect(html).not.toMatch(/script|onerror|javascript:|<img/i);
    expect(html).toContain("Hi");
  });

  it("converts a .docx file, keeping headings and bold", async () => {
    const docx = await buildDocx("Quarterly Review", "Revenue was", "up 12%");
    const { title, html } = await convertUpload("Q3 Review.DOCX", docx);
    expect(title).toBe("Q3 Review");
    expect(html).toContain("<h1>Quarterly Review</h1>");
    expect(html).toContain("<strong>up 12%</strong>");
  });

  it("rejects unsupported types, empty files, oversized files and corrupt docx", async () => {
    await expect(convertUpload("photo.png", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
    await expect(convertUpload("noextension", Buffer.from("x"))).rejects.toMatchObject({ status: 400 });
    await expect(convertUpload("empty.txt", Buffer.alloc(0))).rejects.toMatchObject({ status: 400 });
    await expect(convertUpload("big.txt", Buffer.alloc(IMPORT_MAX_BYTES + 1, "a"))).rejects.toMatchObject({ status: 413 });
    await expect(convertUpload("broken.docx", Buffer.from("not a zip"))).rejects.toMatchObject({ status: 400 });
  });
});

describe("sanitizeContent", () => {
  it("keeps the formatting the editor supports", () => {
    const html = "<h2>T</h2><p><strong>b</strong> <em>i</em> <u>u</u></p><ul><li>x</li></ul><ol><li>y</li></ol>";
    expect(sanitizeContent(html)).toBe(html);
  });

  it("drops anything else", () => {
    expect(sanitizeContent('<p style="color:red" onclick="x()">a</p><iframe src="//evil"></iframe>')).toBe("<p>a</p>");
  });
});

describe("htmlToMarkdown", () => {
  it("exports headings, emphasis and lists", () => {
    const md = htmlToMarkdown("Doc", "<h2>Goals</h2><p><strong>Ship</strong> <em>fast</em></p><ul><li>a</li><li>b</li></ul>");
    expect(md).toContain("# Doc");
    expect(md).toContain("## Goals");
    expect(md).toContain("**Ship** _fast_");
    expect(md).toMatch(/-\s+a\n-\s+b/);
  });
});
