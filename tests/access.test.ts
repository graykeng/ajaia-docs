import { describe, expect, it } from "vitest";
import { canComment, canEdit, canManage, canView, resolveAccess, type Access } from "@/lib/access";

describe("resolveAccess", () => {
  const doc = { ownerId: "alice" };
  const shares = [
    { userId: "bob", role: "editor" as const },
    { userId: "carol", role: "viewer" as const },
  ];

  it("gives the owner owner access, regardless of shares", () => {
    expect(resolveAccess("alice", doc, shares)).toBe("owner");
    expect(resolveAccess("alice", doc, [{ userId: "alice", role: "viewer" }])).toBe("owner");
  });

  it("gives shared users exactly their granted role", () => {
    expect(resolveAccess("bob", doc, shares)).toBe("editor");
    expect(resolveAccess("carol", doc, shares)).toBe("viewer");
  });

  it("gives everyone else no access", () => {
    expect(resolveAccess("dave", doc, shares)).toBe("none");
    expect(resolveAccess("dave", doc, [])).toBe("none");
  });
});

describe("permission matrix", () => {
  //                         view   comment edit   manage
  const matrix: Record<Access, [boolean, boolean, boolean, boolean]> = {
    none:      [false, false, false, false],
    viewer:    [true,  false, false, false],
    commenter: [true,  true,  false, false],
    editor:    [true,  true,  true,  false],
    owner:     [true,  true,  true,  true],
  };

  for (const [access, [view, comment, edit, manage]] of Object.entries(matrix) as [Access, boolean[]][]) {
    it(`${access}: view=${view} comment=${comment} edit=${edit} manage=${manage}`, () => {
      expect(canView(access)).toBe(view);
      expect(canComment(access)).toBe(comment);
      expect(canEdit(access)).toBe(edit);
      expect(canManage(access)).toBe(manage);
    });
  }
});
