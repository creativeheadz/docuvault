import { generateJSON } from '@tiptap/html'
import { marked } from 'marked'
import { tiptapBaseExtensions } from '@/lib/tiptapExtensions'

interface TiptapNode {
  type?: string
  text?: string
  content?: TiptapNode[]
}

const BLOCK_TYPES = new Set(['paragraph', 'heading', 'blockquote', 'codeBlock', 'listItem', 'taskItem', 'horizontalRule'])

/** Walk a TipTap JSON document and produce a markdown-ish plaintext representation. */
export function tiptapToPlainText(doc: unknown): string {
  if (!doc || typeof doc !== 'object') return ''
  const lines: string[] = []
  const walk = (node: TiptapNode) => {
    if (node.type === 'text' && node.text) {
      const last = lines[lines.length - 1] ?? ''
      lines[lines.length - 1] = last + node.text
      return
    }
    if (node.type === 'hardBreak') {
      lines.push('')
      return
    }
    if (node.type && BLOCK_TYPES.has(node.type) && lines[lines.length - 1] !== '') {
      lines.push('')
    }
    node.content?.forEach(walk)
  }
  lines.push('')
  walk(doc as TiptapNode)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/** Heuristic: does the text look like raw markdown the user might want re-parsed? */
export function looksLikeMarkdown(text: string): boolean {
  if (!text.includes('\n')) {
    return /(^|\s)(#{1,6}\s|[*_-]{1,3}|\d+\.\s|\[.*\]\(.*\)|`)/m.test(text)
  }
  // Multi-line: any markdown-ish marker is enough
  return /(^|\n)(#{1,6}\s|[-*+]\s|\d+\.\s|>\s|```)/m.test(text)
}

/** Convert a markdown string (or markdown-as-text) into TipTap JSON. */
export function markdownToTiptapJson(markdown: string): unknown {
  const html = marked.parse(markdown, { async: false, gfm: true }) as string
  return generateJSON(html, tiptapBaseExtensions)
}

export interface ImportedDocument {
  title: string
  content: unknown  // TipTap JSON
}

const stripExt = (filename: string) =>
  filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim()

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const plainTextToHtml = (text: string) =>
  text
    .split(/\n{2,}/)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('')

export async function importDocumentFile(file: File): Promise<ImportedDocument> {
  const text = await file.text()
  const name = file.name.toLowerCase()
  const title = stripExt(file.name) || 'Imported document'

  let html: string
  if (name.endsWith('.md') || name.endsWith('.markdown')) {
    html = marked.parse(text, { async: false, gfm: true }) as string
  } else if (name.endsWith('.html') || name.endsWith('.htm')) {
    html = text
  } else {
    html = plainTextToHtml(text)
  }

  const content = generateJSON(html, tiptapBaseExtensions)
  return { title, content }
}
