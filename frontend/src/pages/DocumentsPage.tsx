import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { getDocuments, createDocument, updateDocument, deleteDocument, getDocumentFolders, createDocumentFolder } from '@/api/documents'
import { getOrganizations } from '@/api/organizations'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { RichTextEditor } from '@/components/ui/RichTextEditor'
import { FileText, Plus, Folder, Pencil, Trash2, ChevronRight } from 'lucide-react'
import type { Document, DocumentFolder } from '@/types'
import toast from 'react-hot-toast'

export default function DocumentsPage() {
  const queryClient = useQueryClient()
  const [editingDoc, setEditingDoc] = useState<Document | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [form, setForm] = useState({ title: '', organization_id: '', folder_id: '' })
  const [editorContent, setEditorContent] = useState<unknown>(null)
  const [folderFormOpen, setFolderFormOpen] = useState(false)
  const [folderName, setFolderName] = useState('')

  const { data: documents = [], isLoading } = useQuery({ queryKey: ['documents'], queryFn: () => getDocuments() })
  const { data: folders = [] } = useQuery({ queryKey: ['document-folders'], queryFn: () => getDocumentFolders() })
  const { data: orgs } = useQuery({ queryKey: ['organizations', 1, ''], queryFn: () => getOrganizations({ page: 1, page_size: 100 }) })

  const createMutation = useMutation({
    mutationFn: () => createDocument({ ...form, content: editorContent }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['documents'] }); toast.success('Document created'); setFormOpen(false) },
  })

  const saveMutation = useMutation({
    mutationFn: () => updateDocument(editingDoc!.id, { title: editingDoc!.title, content: editorContent, change_summary: 'Updated via editor' }),
    onSuccess: (data) => { queryClient.invalidateQueries({ queryKey: ['documents'] }); toast.success('Saved'); setEditingDoc(data as unknown as Document) },
  })

  const deleteMutation = useMutation({
    mutationFn: deleteDocument,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['documents'] }); toast.success('Deleted') },
  })

  const folderMutation = useMutation({
    mutationFn: () => createDocumentFolder({ name: folderName }),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['document-folders'] }); toast.success('Folder created'); setFolderFormOpen(false); setFolderName('') },
  })

  const openEditor = (doc: Document) => { setEditingDoc(doc); setEditorContent(doc.content); setEditorOpen(true) }
  const closeEditor = () => { setEditorOpen(false); setEditingDoc(null); setEditorContent(null) }

  if (editorOpen && editingDoc) {
    return (
      <div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="sm" onClick={closeEditor}>Back</Button>
            <input
              value={editingDoc.title}
              onChange={(e) => setEditingDoc({ ...editingDoc, title: e.target.value })}
              className="text-xl font-bold bg-transparent border-none outline-none text-gray-900 dark:text-white"
            />
            <span className="text-xs text-gray-400">v{editingDoc.version}</span>
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={closeEditor}>Cancel</Button>
            <Button size="sm" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>Save</Button>
          </div>
        </div>
        <RichTextEditor content={editorContent} onChange={setEditorContent} />
      </div>
    )
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Documents</h1>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => setFolderFormOpen(true)}><Folder className="h-4 w-4 mr-2" />New Folder</Button>
          <Button onClick={() => { setForm({ title: '', organization_id: '', folder_id: '' }); setEditorContent(null); setFormOpen(true) }}><Plus className="h-4 w-4 mr-2" />New Document</Button>
        </div>
      </div>

      {folders.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {folders.map((f) => (
            <div key={f.id} className="flex items-center gap-2 px-3 py-2 bg-white dark:bg-gray-800 rounded-lg border border-gray-100 dark:border-gray-700">
              <Folder className="h-4 w-4 text-yellow-500" />
              <span className="text-sm">{f.name}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {documents.map((doc) => (
          <div
            key={doc.id}
            onClick={() => openEditor(doc)}
            className="card p-4 cursor-pointer hover:shadow-md transition-shadow group"
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2 mb-2">
                <FileText className="h-5 w-5 text-primary-500" />
                <h3 className="font-medium text-gray-900 dark:text-white truncate">{doc.title}</h3>
              </div>
              <button
                onClick={(e) => { e.stopPropagation(); if (confirm('Delete?')) deleteMutation.mutate(doc.id) }}
                className="p-1 opacity-0 group-hover:opacity-100 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition"
              >
                <Trash2 className="h-4 w-4 text-red-400" />
              </button>
            </div>
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span>v{doc.version}</span>
              <span>Updated {new Date(doc.updated_at).toLocaleDateString()}</span>
            </div>
          </div>
        ))}
        {!documents.length && !isLoading && (
          <div className="col-span-3 flex flex-col items-center justify-center py-16 text-gray-400">
            <FileText className="h-12 w-12 mb-3" />
            <p>No documents yet</p>
          </div>
        )}
      </div>

      <Modal open={formOpen} onClose={() => setFormOpen(false)} title="New Document" size="lg">
        <form onSubmit={(e) => { e.preventDefault(); createMutation.mutate() }} className="space-y-4">
          <Input label="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
          <div>
            <label className="block text-sm font-medium mb-1">Organization (optional)</label>
            <select value={form.organization_id} onChange={(e) => setForm({ ...form, organization_id: e.target.value })} className="input-field">
              <option value="">None</option>
              {orgs?.items.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
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
