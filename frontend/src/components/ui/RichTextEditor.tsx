import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import { marked } from 'marked'
import { useRef } from 'react'
import { tiptapBaseExtensions } from '@/lib/tiptapExtensions'
import Placeholder from '@tiptap/extension-placeholder'
import {
  Bold, Italic, Underline as UnderlineIcon, Strikethrough, Code, Heading1, Heading2, Heading3,
  List, ListOrdered, CheckSquare, Quote, Minus, Link as LinkIcon, AlignLeft, AlignCenter, AlignRight,
  Highlighter, Undo, Redo,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { useEffect } from 'react'

marked.setOptions({ gfm: true, breaks: false })

// Heuristic: if pasted plain text looks like a single line of ordinary prose
// (no markdown markers), skip the conversion so simple inline pastes don't
// get wrapped in extra paragraph blocks unexpectedly.
const looksLikeMarkdown = (text: string): boolean => {
  if (text.includes('\n')) return true
  return /(^|\s)(#{1,6}\s|[*_-]{1,3}|\d+\.\s|\[.*\]\(.*\)|`)/m.test(text)
}

interface RichTextEditorProps {
  content?: unknown
  onChange?: (content: unknown) => void
  placeholder?: string
  className?: string
  editable?: boolean
}

export function RichTextEditor({ content, onChange, placeholder = 'Start writing...', className, editable = true }: RichTextEditorProps) {
  const editorRef = useRef<Editor | null>(null)

  const editor = useEditor({
    extensions: [
      ...tiptapBaseExtensions,
      Placeholder.configure({ placeholder }),
    ],
    content: content as string || '',
    editable,
    onCreate: ({ editor }) => { editorRef.current = editor },
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON())
    },
    editorProps: {
      handlePaste: (_view, event) => {
        const clipboard = event.clipboardData
        if (!clipboard) return false

        // Defer to TipTap's native HTML handler when the clipboard has HTML —
        // Word/Notion/web pastes already carry rich formatting we should keep.
        if (clipboard.getData('text/html')) return false

        const text = clipboard.getData('text/plain')
        if (!text || !looksLikeMarkdown(text)) return false

        const html = marked.parse(text, { async: false }) as string
        editorRef.current?.commands.insertContent(html)
        event.preventDefault()
        return true
      },
    },
  })

  useEffect(() => {
    if (editor && content && JSON.stringify(editor.getJSON()) !== JSON.stringify(content)) {
      editor.commands.setContent(content as string)
    }
  }, [content, editor])

  useEffect(() => {
    if (editor && editor.isEditable !== editable) {
      editor.setEditable(editable)
    }
  }, [editable, editor])

  if (!editor) return null

  const ToolBtn = ({ active, onClick, children, title }: { active?: boolean; onClick: () => void; children: React.ReactNode; title: string }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        'p-1.5 rounded hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors',
        active && 'bg-gray-200 dark:bg-gray-600 text-primary-600'
      )}
    >
      {children}
    </button>
  )

  const iconSize = 'h-4 w-4'

  return (
    <div className={cn('border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden', className)}>
      {editable && (
      <div className="flex flex-wrap items-center gap-0.5 p-2 border-b border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
        <ToolBtn active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()} title="Bold"><Bold className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()} title="Italic"><Italic className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('underline')} onClick={() => editor.chain().focus().toggleUnderline().run()} title="Underline"><UnderlineIcon className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('strike')} onClick={() => editor.chain().focus().toggleStrike().run()} title="Strikethrough"><Strikethrough className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('code')} onClick={() => editor.chain().focus().toggleCode().run()} title="Code"><Code className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('highlight')} onClick={() => editor.chain().focus().toggleHighlight().run()} title="Highlight"><Highlighter className={iconSize} /></ToolBtn>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolBtn active={editor.isActive('heading', { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} title="H1"><Heading1 className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} title="H2"><Heading2 className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} title="H3"><Heading3 className={iconSize} /></ToolBtn>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolBtn active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()} title="Bullet List"><List className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()} title="Ordered List"><ListOrdered className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('taskList')} onClick={() => editor.chain().focus().toggleTaskList().run()} title="Task List"><CheckSquare className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()} title="Quote"><Quote className={iconSize} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Divider"><Minus className={iconSize} /></ToolBtn>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolBtn active={editor.isActive({ textAlign: 'left' })} onClick={() => editor.chain().focus().setTextAlign('left').run()} title="Align Left"><AlignLeft className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'center' })} onClick={() => editor.chain().focus().setTextAlign('center').run()} title="Center"><AlignCenter className={iconSize} /></ToolBtn>
        <ToolBtn active={editor.isActive({ textAlign: 'right' })} onClick={() => editor.chain().focus().setTextAlign('right').run()} title="Align Right"><AlignRight className={iconSize} /></ToolBtn>
        <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1" />
        <ToolBtn onClick={() => {
          const url = window.prompt('URL')
          if (url) editor.chain().focus().setLink({ href: url }).run()
        }} title="Link" active={editor.isActive('link')}><LinkIcon className={iconSize} /></ToolBtn>
        <div className="flex-1" />
        <ToolBtn onClick={() => editor.chain().focus().undo().run()} title="Undo"><Undo className={iconSize} /></ToolBtn>
        <ToolBtn onClick={() => editor.chain().focus().redo().run()} title="Redo"><Redo className={iconSize} /></ToolBtn>
      </div>
      )}
      <EditorContent
        editor={editor}
        className="prose dark:prose-invert max-w-none p-4 min-h-[200px] focus:outline-none [&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[200px] [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0"
      />
    </div>
  )
}
