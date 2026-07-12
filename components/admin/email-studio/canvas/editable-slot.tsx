'use client'

import { useEffect, useRef } from 'react'
import { useEditor, useEditorState, EditorContent, type Editor } from '@tiptap/react'
import { BubbleMenu } from '@tiptap/react/menus'
import StarterKit from '@tiptap/starter-kit'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import { Bold, Italic, Link2 } from 'lucide-react'

// THE ON-CANVAS INLINE-EDITABLE SLOT (Email Studio WYSIWYG prototype, Slice A). One editor per text slot on
// the live email canvas: you click the text in the email and type right there. Two modes off one component:
//   • rich  — a `textarea` content field. Bold / Italic / Link marks; a floating Tiptap BubbleMenu that
//             FORMATS the current selection (it never holds the content). Stores allowlisted inline HTML.
//   • plain — a `text` content field. No marks, no bubble. Stores plain text.
// The store re-sanitises on save AND the email renderer re-sanitises on read (renderInlineRich), so the
// canvas is a convenience surface, never a trust boundary. StarterKit is TRIMMED to the inline marks only
// (every block node we do not use is disabled) to keep the bundle lean. Semantic DAWN tokens, no hex; the
// BubbleMenu copy is UI, so voice canon applies (no em dashes).

/** ProseMirror surface styling: kill the editor outline + paragraph margins, underline links, and paint the
 *  empty-state placeholder (the field label) in a muted token so an empty slot names itself on the canvas. */
const SURFACE =
  '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-w-[2ch] [&_p]:m-0 [&_a]:underline ' +
  '[&_.is-editor-empty:first-child]:before:content-[attr(data-placeholder)] ' +
  '[&_.is-editor-empty:first-child]:before:text-subtle [&_.is-editor-empty:first-child]:before:opacity-70 ' +
  '[&_.is-editor-empty:first-child]:before:float-left [&_.is-editor-empty:first-child]:before:h-0 ' +
  '[&_.is-editor-empty:first-child]:before:pointer-events-none'

/** Turn Tiptap's block HTML into the inline string we store: paragraph breaks become <br>, the <p> wrappers
 *  drop. The stored value is re-sanitised to the allowlist on save + render, so this only needs to be inline. */
function inlineHtml(editor: Editor): string {
  return editor
    .getHTML()
    .replace(/<\/p>\s*<p[^>]*>/gi, '<br>')
    .replace(/<\/?p[^>]*>/gi, '')
    .trim()
}

/** The floating format toolbar shown over a selection in a rich slot. Bold / Italic / Link only. */
function RichBubble({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      link: e.isActive('link'),
    }),
  })
  const btn = (on: boolean) =>
    `flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
      on ? 'bg-primary text-on-primary' : 'text-muted hover:bg-surface-elevated hover:text-text'
    }`
  const toggleLink = () => {
    if (state.link) {
      editor.chain().focus().extendMarkRange('link').unsetLink().run()
      return
    }
    const url = typeof window !== 'undefined' ? window.prompt('Link to (https://, mailto:, or /path)') : null
    if (url && url.trim()) {
      editor.chain().focus().extendMarkRange('link').setLink({ href: url.trim() }).run()
    }
  }
  return (
    <BubbleMenu
      editor={editor}
      className="flex items-center gap-0.5 rounded-lg border border-border bg-surface p-1 shadow-lg"
    >
      <button type="button" aria-label="Bold" aria-pressed={state.bold} className={btn(state.bold)} onClick={() => editor.chain().focus().toggleBold().run()}>
        <Bold className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" aria-label="Italic" aria-pressed={state.italic} className={btn(state.italic)} onClick={() => editor.chain().focus().toggleItalic().run()}>
        <Italic className="h-3.5 w-3.5" aria-hidden />
      </button>
      <button type="button" aria-label={state.link ? 'Remove link' : 'Add link'} aria-pressed={state.link} className={btn(state.link)} onClick={toggleLink}>
        <Link2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </BubbleMenu>
  )
}

export function EditableSlot({
  value,
  placeholder,
  rich,
  className,
  onChange,
}: {
  /** The current stored value (inline HTML for rich, plain text for plain). Seeds the editor ONCE — the slot
   *  is uncontrolled after mount so the caret never jumps while typing; a campaign switch remounts it (keyed
   *  upstream by campaign id). */
  value: string
  /** The empty-state placeholder (the field label, e.g. "Headline"), so an empty slot names itself. */
  placeholder: string
  /** Rich = Bold/Italic/Link + bubble (a `textarea` field); plain = no marks (a `text` field). */
  rich: boolean
  /** Typography classes matching the email look for this slot. */
  className?: string
  onChange: (next: string) => void
}) {
  // Always call the freshest onChange (the editor is created once, so a captured callback would go stale).
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        // Trim to the inline marks we use; disable every block node + list + rule we do not.
        heading: false,
        blockquote: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        code: false,
        codeBlock: false,
        horizontalRule: false,
        strike: false,
        ...(rich ? {} : { bold: false, italic: false }),
      }),
      ...(rich ? [Link.configure({ openOnClick: false, autolink: false })] : []),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editorProps: { attributes: { class: 'outline-none' } },
    onUpdate: ({ editor: e }) => onChangeRef.current(rich ? inlineHtml(e) : e.getText()),
  })

  return (
    <div className={`${SURFACE} ${className ?? ''}`}>
      <EditorContent editor={editor} />
      {rich && editor && <RichBubble editor={editor} />}
    </div>
  )
}
