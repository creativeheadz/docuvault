import { useState } from 'react'
import { Routes, Route, Link, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { Boxes, Plus, ArrowRight, Sparkles, Hash } from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Modal } from '@/components/ui/Modal'
import { Spinner } from '@/components/ui/Spinner'
import { getSystems, createSystem } from '@/api/systems'
import type { System } from '@/types'
import SystemDetailPage from './SystemDetailPage'


function StatusDot({ status }: { status: string }) {
  const color =
    status === 'active' ? 'var(--green)'
    : status === 'archived' ? 'var(--ink-faint)'
    : 'var(--warn)'
  return (
    <span
      className="inline-block h-1.5 w-1.5"
      style={{ background: color, borderRadius: 0, boxShadow: `0 0 6px ${color}` }}
    />
  )
}


function SystemsList() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(false)
  const [form, setForm] = useState({ name: '', category: '', short_description: '' })

  const { data: systems = [], isLoading } = useQuery({
    queryKey: ['systems', search],
    queryFn: () => getSystems({ search }),
  })

  const createMut = useMutation({
    mutationFn: () => createSystem({ name: form.name, category: form.category || null, short_description: form.short_description || null }),
    onSuccess: (sys) => {
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      toast.success('System created — let\'s talk about it')
      setOpen(false)
      setForm({ name: '', category: '', short_description: '' })
      navigate(`/systems/${sys.id}`)
    },
    onError: (e: unknown) => toast.error((e as { message?: string })?.message || 'Failed to create'),
  })

  return (
    <div>
      {/* Header */}
      <div className="section-header">
        <div className="flex items-baseline gap-3">
          <span className="kicker text-ink-faint">§ Inventory</span>
          <h1 className="text-3xl font-serif italic" style={{ fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380' }}>
            Systems.
          </h1>
          <span className="text-xxs font-mono text-ink-faint uppercase tracking-button">
            {systems.length} documented
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-56"
          />
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-3.5 w-3.5" /> New
          </Button>
        </div>
      </div>

      {/* Pitch strip */}
      <div
        className="mb-6 px-5 py-4 flex items-start gap-3"
        style={{ background: 'var(--ember-wash)', borderLeft: '3px solid var(--ember)' }}
      >
        <Sparkles className="h-4 w-4 mt-0.5" style={{ color: 'var(--ember)' }} />
        <div className="text-xs font-mono leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
          <div style={{ color: 'var(--ink)' }}>Chat-driven documentation.</div>
          Open a system to talk it through. The assistant searches MemPalace, drafts the record, and waits for your nod.
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : systems.length === 0 ? (
        <div className="empty-instrument">
          <Boxes className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--ink-faint)' }} />
          <div className="kicker mb-2">§ Empty Bench</div>
          <p className="font-mono text-xs" style={{ color: 'var(--ink-faint)' }}>
            No systems documented yet. Start a new one and chat your way through it.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {systems.map((s) => (
            <Link key={s.id} to={`/systems/${s.id}`} className="group">
              <motion.div
                whileHover={{ y: -2 }}
                className="card-instrument h-full flex flex-col gap-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusDot status={s.status} />
                    <span className="kicker text-ink-faint">
                      {s.category || 'uncategorized'}
                    </span>
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--ember)' }} />
                </div>
                <h3 className="font-serif italic text-xl leading-tight" style={{ color: 'var(--ink)', fontVariationSettings: '"opsz" 144, "SOFT" 60, "wght" 400' }}>
                  {s.name}
                </h3>
                {s.short_description && (
                  <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
                    {s.short_description}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5 mt-auto pt-2">
                  {s.tags.slice(0, 5).map((t) => (
                    <span key={t} className="badge-instrument" style={{ color: 'var(--ink-faint)' }}>
                      <Hash className="h-2.5 w-2.5 mr-1" /> {t}
                    </span>
                  ))}
                  {Object.keys(s.snippets || {}).length > 0 && (
                    <span className="badge-instrument" style={{ color: 'var(--ember)' }}>
                      {Object.keys(s.snippets).length} fact{Object.keys(s.snippets).length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </motion.div>
            </Link>
          ))}
        </div>
      )}

      {/* Create modal */}
      <Modal open={open} onClose={() => setOpen(false)} title="New System" size="md">
        <form
          onSubmit={(e) => { e.preventDefault(); if (form.name.trim()) createMut.mutate() }}
          className="space-y-4"
        >
          <Input
            label="Name"
            placeholder="e.g. Infisical, Old Forge VPS, MemPalace"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            required
            autoFocus
          />
          <Input
            label="Category"
            placeholder="server / vm / saas / monitoring / secrets / identity / network"
            value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <Input
            label="One-line description"
            placeholder="optional — the assistant will help refine this"
            value={form.short_description}
            onChange={(e) => setForm({ ...form, short_description: e.target.value })}
          />
          <p className="text-xxs font-mono" style={{ color: 'var(--ink-faint)' }}>
            You'll land in a chat where you and the assistant fill out the rest together.
          </p>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" loading={createMut.isPending} disabled={!form.name.trim()}>
              Create &amp; Chat
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  )
}


export default function SystemsPage() {
  return (
    <Routes>
      <Route index element={<SystemsList />} />
      <Route path=":id" element={<SystemDetailPage />} />
    </Routes>
  )
}
