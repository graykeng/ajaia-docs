// Regenerates samples/sample.docx: `node scripts/make-sample-docx.mts`
import { writeFileSync } from "node:fs";
import { buildDocx } from "../tests/helpers/docx.ts";

writeFileSync("samples/sample.docx", await buildDocx("Quarterly Review", "Revenue was", "up 12%"));
