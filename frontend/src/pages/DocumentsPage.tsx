import { useMemo, useRef, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import {
  getDocuments, createDocument, updateDocument, deleteDocument,
  getDocumentFolders, createDocumentFolder, deleteDocumentFolder,
} from '@/api/documents'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import {
  FileText, Plus, Folder, Trash2, Upload, FolderOpen, Home, Sparkles,
  Eye, Pencil,
} from 'lucide-react'
import type { Document } from '@/types'
import {
  importDocumentFile, tiptapToPlainText, looksLikeMarkdown, markdownToTiptapJson,
} from '@/lib/importDocument'
import toast from 'react-hot-toast'

const errorDetail = (err: unknown): string => {
  const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg)
  return 'Unexpected error'
}

export default function DocumentsPage() {
  const queryClient = useQueryClient()

  // Browsing state
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)

  // Modal / form state
  const [formOpen, setFormOpen] = useState(false)
  const [form, setForm] = useState({ title: '', organization_id: '', folder_id: '' })
  const [editorContent, setEditorContent] = useState<unknown>(null)
  const [folderFormOpen, setFolderFormOpen] = useState(false)
  const [folderName, setFolderName] = useState('')
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Viewer state
  const [openDoc, setOpenDoc] = useState<Document | null>(null)
  const [viewMode, setViewMode] = useState<'preview' | 'edit'>('preview')
  const [editTitle, setEditTitle] = useState('')
  const [editFolderId, setEditFolderId] = useState<string>('')

  const { data: documents = [], isLoading } = useQuery({
    queryKey: ['documents', currentFolderId ?? 'root'],
    queryFn: () => getDocuments({ folder_id: currentFolderId ?? undefined }),
  })
  const { data: folders = [] } = useQuery({
    queryKey: ['document-folders'],
    queryFn: () => getDocumentFolders(),
  })
  const { data: orgs } = useQuery({
    queryKey: ['organizations', 1, ''],
    queryFn: () => getOrganizations({ page: 1, page_size: 100 }),
  })

  const currentFolder = useMemo(
    () => folders.find((f) => f.id === currentFolderId) ?? null,
    [folders, currentFolderId]
  )

  const invalidateDocs = () => queryClient.invalidateQueries({ queryKey: ['documents'] })
  const invalidateFolders = () => queryClient.invalidateQueries({ queryKey: ['document-folders'] })

  // ---- Mutations ----

  const createMutation = useMutation({
    mutationFn: () => createDocument({
      title: form.title,
      organization_id: form.organization_id || null,
      folder_id: form.folder_id || null,
      content: editorContent,
    }),
    onSuccess: () => {
      invalidateDocs()
      toast.success('Document created')
      setFormOpen(false)
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const saveMutation = useMutation({
    mutationFn: () => updateDocument(openDoc!.id, {
      title: editTitle,
      folder_id: editFolderId || null,
      content: editorContent,
      change_summary: 'Edited',
    }),
    onSuccess: (data) => {
      invalidateDocs()
      toast.success('Saved')
      setOpenDoc(data as unknown as Document)
      setViewMode('preview')
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => {
      invalidateDocs()
      toast.success('Deleted')
      setOpenDoc(null)
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const folderMutation = useMutation({
    mutationFn: () => createDocumentFolder({ name: folderName }),
    onSuccess: () => {
      invalidateFolders()
      toast.success('Folder created')
      setFolderFormOpen(false)
      setFolderName('')
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  const deleteFolderMutation = useMutation({
    mutationFn: (id: string) => deleteDocumentFolder(id),
    onSuccess: () => {
      invalidateFolders()
      invalidateDocs()
      toast.success('Folder deleted')
      if (currentFolderId) setCurrentFolderId(null)
    },
    onError: (err) => toast.error(errorDetail(err)),
  })

  // ---- File upload ----

  const handleUploadClick = () => fileInputRef.current?.click()

  const handleFileChosen = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const { title, content } = await importDocumentFile(file)
      setForm({ title, organization_id: '', folder_id: currentFolderId ?? '' })
      setEditorContent(content)
      setFormOpen(true)
      toast.success(`Loaded "${file.name}" — review and save`)
    } catch (err) {
      console.error(err)
      toast.error('Could not parse that file')
    }
  }

  // ---- Open / close viewer ----

  const openDocument = (doc: Document) => {
    setOpenDoc(doc)
    setEditTitle(doc.title)
    setEditFolderId(doc.folder_id ?? '')
    setEditorContent(doc.content)
    setViewMode('preview')
  }
  const closeDocument = () => {
    setOpenDoc(null)
    setEditorContent(null)
  }

  const previewMarkdown = useMemo(() => {
    if (!openDoc) return ''
    return tiptapToPlainText(openDoc.content)
  }, [openDoc])

  const previewIsMarkdown = useMemo(
    () => looksLikeMarkdown(previewMarkdown),
    [previewMarkdown]
  )

  const reformatNow = () => {
    if (!openDoc) return
    const text = tiptapToPlainText(openDoc.content)
    if (!text.trim()) {
      toast.error('Nothing to reformat')
      return
    }
    const json = markdownToTiptapJson(text)
    setEditorContent(json)
    setViewMode('edit')
    toast.success('Reformatted — save to keep')
  }

  // ---- Viewer screen ----

  if (openDoc) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <Button variant="ghost" size="sm" onClick={closeDocument}>Back</Button>
            {viewMode === 'edit' ? (
              <input
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                className="text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white min-w-[200px]"
              />
            ) : (
              <h1 className="text-xl font-bold truncate">{openDoc.title}</h1>
            )}
            <span className="text-xs text-gray-400 whitespace-nowrap">v{openDoc.version}</span>
          </div>
          <div className="flex items-center gap-2">
            {viewMode === 'preview' ? (
              <Button size="sm" variant="secondary" onClick={() => setViewMode('edit')}>
                <Pencil className="h-4 w-4 mr-2" />Edit
              </Button>
            ) : (
              <>
                <Button size="sm" variant="ghost" onClick={reformatNow} title="Re-parse content as markdown — useful for legacy documents that show raw markdown text">
                  <Sparkles className="h-4 w-4 mr-2" />Reformat from markdown
                </Button>
                <Button size="sm" variant="secondary" onClick={() => { setEditorContent(openDoc.content); setEditTitle(openDoc.title); setEditFolderId(openDoc.folder_id ?? ''); setViewMode('preview') }}>
                  <Eye className="h-4 w-4 mr-2" />Preview
                </Button>
                <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
              </>
            )}
            <button
              onClick={() => { if (confirm(`Delete "${openDoc.title}"?`)) deleteMutation.mutate(openDoc.id) }}
              className="p-2 text-ink-faint hover:text-bad rounded"
              title="Delete document"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>

        {viewMode === 'edit' && (
          <div className="mb-4 flex items-center gap-3 text-sm">
            <label className="text-ink-dim">Folder:</label>
            <select
              value={editFolderId}
              onChange={(e) => setEditFolderId(e.target.value)}
              className="bg-surface border border-line rounded px-2 py-1"
            >
              <option value="">— Root —</option>
              {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
        )}

        {viewMode === 'preview' ? (
          previewIsMarkdown ? (
            <div className="prose dark:prose-invert max-w-none p-4 border border-line rounded-lg bg-surface">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{previewMarkdown}</ReactMarkdown>
            </div>
          ) : (
            <RichTextEditor content={openDoc.content} editable={false} />
          )
        ) : (
          <RichTextEditor content={editorContent} onChange={setEditorContent} />
        )}
      </div>
    )
  }

  // ---- List screen ----

  return (
    <div>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
        <div>
          <div className="flex items-center gap-2 text-sm text-ink-faint mb-1">
            <button
              onClick={() => setCurrentFolderId(null)}
              className={`flex items-center gap-1 ${!currentFolderId ? 'text-ember' : 'hover:text-ink'}`}
            >
              <Home className="h-3.5 w-3.5" />All documents
            </button>
            {currentFolder && (
              <>
                <span>/</span>
                <span className="text-ink flex items-center gap-1">
                  <FolderOpen className="h-3.5 w-3.5 text-yellow-500" />{currentFolder.name}
                </span>
              </>
            )}
          </div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
        </div>
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.markdown,.txt,.html,.htm,text/markdown,text/plain,text/html"
            onChange={handleFileChosen}
            className="hidden"
          />
          <Button variant="secondary" onClick={() => setFolderFormOpen(true)}><Folder className="h-4 w-4 mr-2" />New Folder</Button>
          <Button variant="secondary" onClick={handleUploadClick}><Upload className="h-4 w-4 mr-2" />Upload</Button>
          <Button onClick={() => { setForm({ title: '', organization_id: '', folder_id: currentFolderId ?? '' }); setEditorContent(null); setFormOpen(true) }}>
            <Plus className="h-4 w-4 mr-2" />New Document
          </Button>
        </div>
      </div>

      {folders.length > 0 && !currentFolderId && (
        <div className="mb-5">
          <div className="kicker text-ink-faint mb-2">§ Folders</div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {folders.map((f) => (
              <div
                key={f.id}
                onClick={() => setCurrentFolderId(f.id)}
                className="group flex items-center gap-2 px-3 py-2.5 bg-surface-raised rounded-lg border border-line hover:border-ember cursor-pointer"
              >
                <Folder className="h-4 w-4 text-yellow-500" />
                <span className="text-sm flex-1 truncate">{f.name}</span>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete folder "${f.name}"? Documents inside will move to root.`)) deleteFolderMutation.mutate(f.id) }}
                  className="opacity-0 group-hover:opacity-100 text-ink-faint hover:text-bad"
                  title="Delete folder"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {currentFolderId && (
        <div className="mb-3">
          <div className="kicker text-ink-faint mb-2">§ {currentFolder?.name ?? 'Folder'}</div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => {
          const docFolder = folders.find((f) => f.id === doc.folder_id)
          return (
            <div
              key={doc.id}
              onClick={() => openDocument(doc)}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2 mb-2 min-w-0">
                  <FileText className="h-5 w-5 text-primary-500 shrink-0" />
                  <h3 className="font-medium text-gray-900 dark:text-white truncate">{doc.title}</h3>
                </div>
                <button
                  onClick={(e) => { e.stopPropagation(); if (confirm(`Delete "${doc.title}"?`)) deleteMutation.mutate(doc.id) }}
                  className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition shrink-0"
                  title="Delete document"
                >
                  <Trash2 className="h-4 w-4 text-red-400" />
                </button>
              </div>
              <div className="flex items-center gap-2 text-xs text-gray-400 flex-wrap">
                <span>v{doc.version}</span>
                <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
                {docFolder && !currentFolderId && (
                  <span className="flex items-center gap-1">
                    <Folder className="h-3 w-3 text-yellow-500" />{docFolder.name}
                  </span>
                )}
              </div>
            </div>
          )
        })}
        {!documents.length && !isLoading && (
          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="h-12 w-12 mb-3" />
            <p>{currentFolderId ? 'No documents in this folder yet.' : 'No documents yet'}</p>
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Document" size="lg">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }} className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Organization (optional)</label>
              <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field">
                <option value="">None</option>
                {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Folder (optional)</label>
              <select value={form.folder_id} onChange={(e) => setForm({ ...form, folder_id: e.target.value })} className="input-field">
                <option value="">— Root —</option>
                {folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <RichTextEditor content={editorContent} onChange={setEditorContent} placeholder="Start writing..." />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>

      <Modal open={folderFormOpen} onClose={() => setFolderFormOpen(false)} title="New Folder">
        <form onSubmit={(e) => { e.preventDefault(); folderMutation.mutate() }} className="space-y-4">
          <Input label="Folder Name" value={folderName} onChange={(e) => setFolderName(e.target.value)} required />
          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="secondary" onClick={() => setFolderFormOpen(false)}>Cancel</Button>
            <Button type="submit" loading={folderMutation.isPending}>Create</Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}
