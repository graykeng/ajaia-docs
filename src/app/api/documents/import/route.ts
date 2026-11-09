import { createDocument } from "@/lib/documents";
import { HttpError } from "@/lib/http";
import { convertUpload, IMPORT_MAX_BYTES } from "@/lib/importFile";
import { authed } from "@/lib/route";

/** Upload a .txt, .md or .docx file and turn it into a new editable document. */
export const POST = authed(async (req, user) => {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, "Expected a file upload.");
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Choose a file to import.");
  if (file.size > IMPORT_MAX_BYTES) throw new HttpError(413, "That file is too large. The limit is 2 MB.");

  const { title, html } = await convertUpload(file.name, Buffer.from(await file.arrayBuffer()));
  const doc = await createDocument(user, { title, content: html, versionLabel: `Imported from ${file.name}`.slice(0, 120) });
  return Response.json({ document: doc }, { status: 201 });
});
