/**
 * Access control, as pure functions.
 *
 * Every API route and page resolves the caller's access through `resolveAccess`
 * and then asks a `can*` question. Keeping this free of I/O makes the whole
 * permission matrix unit-testable (see tests/access.test.ts).
 */

export const SHARE_ROLES = ["viewer", "commenter", "editor"] as const;
export type ShareRole = (typeof SHARE_ROLES)[number];
export type Access = "owner" | ShareRole | "none";

const RANK: Record<Access, number> = { none: 0, viewer: 1, commenter: 2, editor: 3, owner: 4 };

export function resolveAccess(
  userId: string,
  doc: { ownerId: string },
  shares: ReadonlyArray<{ userId: string; role: ShareRole }>,
): Access {
  if (doc.ownerId === userId) return "owner";
  return shares.find((s) => s.userId === userId)?.role ?? "none";
}

const atLeast = (access: Access, min: Access) => RANK[access] >= RANK[min];

export const canView = (a: Access) => atLeast(a, "viewer");
export const canComment = (a: Access) => atLeast(a, "commenter");
export const canEdit = (a: Access) => atLeast(a, "editor");
/** Sharing and deletion stay with the owner: editors cannot re-share or delete. */
export const canManage = (a: Access) => a === "owner";

export const ACCESS_LABEL: Record<Access, string> = {
  owner: "Owner",
  editor: "Editor",
  commenter: "Commenter",
  viewer: "Viewer",
  none: "No access",
};
