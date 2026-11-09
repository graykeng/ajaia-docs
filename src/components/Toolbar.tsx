"use client";

import { useEditorState, type Editor } from "@tiptap/react";

interface ButtonProps {
  label: string;
  title: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  className?: string;
}

function ToolButton({ label, title, active, disabled, onClick, className = "" }: ButtonProps) {
  return (
    <button
      type="button"
      className={`tool ${active ? "tool-active" : ""} ${className}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: don't let the button take focus on mouse down.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
    >
      {label}
    </button>
  );
}

export function Toolbar({ editor }: { editor: Editor }) {
  // Re-render only when the formatting under the cursor changes.
  const s = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor.isActive("bold"),
      italic: editor.isActive("italic"),
      underline: editor.isActive("underline"),
      strike: editor.isActive("strike"),
      h1: editor.isActive("heading", { level: 1 }),
      h2: editor.isActive("heading", { level: 2 }),
      h3: editor.isActive("heading", { level: 3 }),
      bullet: editor.isActive("bulletList"),
      ordered: editor.isActive("orderedList"),
      quote: editor.isActive("blockquote"),
      canUndo: editor.can().undo(),
      canRedo: editor.can().redo(),
    }),
  });
  const chain = () => editor.chain().focus();
  const block = s.h1 ? "1" : s.h2 ? "2" : s.h3 ? "3" : "p";

  return (
    <div className="toolbar" role="toolbar" aria-label="Formatting">
      <ToolButton label="↶" title="Undo (⌘Z)" disabled={!s.canUndo} onClick={() => chain().undo().run()} />
      <ToolButton label="↷" title="Redo (⌘⇧Z)" disabled={!s.canRedo} onClick={() => chain().redo().run()} />
      <span className="tool-sep" />
      <select
        className="tool-select"
        aria-label="Text style"
        value={block}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "p") chain().setParagraph().run();
          else chain().setHeading({ level: Number(v) as 1 | 2 | 3 }).run();
        }}
      >
        <option value="p">Normal text</option>
        <option value="1">Heading 1</option>
        <option value="2">Heading 2</option>
        <option value="3">Heading 3</option>
      </select>
      <span className="tool-sep" />
      <ToolButton label="B" title="Bold (⌘B)" className="tool-b" active={s.bold} onClick={() => chain().toggleBold().run()} />
      <ToolButton label="I" title="Italic (⌘I)" className="tool-i" active={s.italic} onClick={() => chain().toggleItalic().run()} />
      <ToolButton label="U" title="Underline (⌘U)" className="tool-u" active={s.underline} onClick={() => chain().toggleUnderline().run()} />
      <ToolButton label="S" title="Strikethrough" className="tool-s" active={s.strike} onClick={() => chain().toggleStrike().run()} />
      <span className="tool-sep" />
      <ToolButton label="• List" title="Bulleted list" active={s.bullet} onClick={() => chain().toggleBulletList().run()} />
      <ToolButton label="1. List" title="Numbered list" active={s.ordered} onClick={() => chain().toggleOrderedList().run()} />
      <ToolButton label="❝ Quote" title="Block quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()} />
    </div>
  );
}
