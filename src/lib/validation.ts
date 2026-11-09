import { z } from "zod";
import { SHARE_ROLES } from "./access";

const title = z
  .string({ error: "Title must be text." })
  .trim()
  .min(1, "Title cannot be empty.")
  .max(200, "Title is too long (200 characters max).");

const content = z
  .string({ error: "Content must be text." })
  .max(1_000_000, "Document is too large (1 MB max).");

export const loginSchema = z.object({ userId: z.string().min(1, "Choose a user.") });

export const createDocumentSchema = z.object({ title: title.optional() });

export const updateDocumentSchema = z
  .object({
    title: title.optional(),
    content: content.optional(),
    /** The version the client last saw; enables conflict detection. */
    baseVersion: z.number().int().positive().optional(),
    /** Overwrite even if the document changed since baseVersion. */
    force: z.boolean().optional(),
  })
  .refine((v) => v.title !== undefined || v.content !== undefined, "Nothing to update.");

export const shareSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  role: z.enum(SHARE_ROLES, "Role must be viewer, commenter or editor."),
});

export const commentSchema = z.object({
  body: z.string().trim().min(1, "Comment cannot be empty.").max(2000, "Comment is too long."),
  quote: z.string().trim().max(300).optional(),
});

export const updateCommentSchema = z.object({ resolved: z.boolean() });
