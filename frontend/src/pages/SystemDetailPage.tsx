import { useEffect, useMemo, useRef, useState } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import {
  ArrowLeft, Send, Loader2, Hash, Wrench, Search, BookOpen, Save, Trash2,
  ChevronDown, ChevronRight, Sparkles, Brain, FileText, Tag, Database,
} from 'lucide-react'
import toast from 'react-hot-toast'

import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
import {
  getSystem, getSystemChat, sendSystemChatMessage, updateSystem, deleteSystem,
} from '@/api/systems'
import type { System, SystemChatMessage, SystemToolEvent } from '@/types'


// ---- helpers ---------------------------------------------------------------

interface RenderedTurn {
  role: 'user' | 'assistant'
  text: string
  toolCalls: { id: string; name: string; input: Record<string, unknown> }[]
  toolResults: Record<string, unknown> // tool_use_id -> result
  ts: string
}

function flattenMessages(rows: SystemChatMessage[]): RenderedTurn[] {
  // Each row has Anthropic-style content blocks. Group user-text turns and
  // assistant-text+tool_use turns; collapse tool_result blocks into the prior
  // assistant turn so the UI shows: user → assistant (with tool calls inline).
  const out: RenderedTurn[] = []
  const resultsById: Record<string, unknown> = {}

  for (const row of rows) {
    const blocks = row.content as Array<Record<string, unknown>>
    let text = ''
    const toolCalls: RenderedTurn['toolCalls'] = []

    for (const b of blocks) {
      if (b.type === 'text' && typeof b.text === 'string') {
        text += b.text
      } else if (b.type === 'tool_use') {
        toolCalls.push({
          id: String(b.id),
          name: String(b.name),
          input: (b.input as Record<string, unknown>) || {},
        })
      } else if (b.type === 'tool_result') {
        resultsById[String(b.tool_use_id)] = b.content
      }
    }

    // skip pure tool_result rows (they were absorbed into resultsById)
    if (!text && toolCalls.length === 0) continue

    out.push({
      role: row.role,
      text: text.trim(),
      toolCalls,
      toolResults: {},
      ts: row.created_at,
    })
  }

  // Fold tool results into matching assistant turn
  for (const turn of out) {
    if (turn.role !== 'assistant') continue
    for (const call of turn.toolCalls) {
      if (call.id in resultsById) {
        turn.toolResults[call.id] = resultsById[call.id]
      }
    }
  }

  return out
}


function ToolCallStrip({ call, result }: { call: RenderedTurn['toolCalls'][0]; result: unknown }) {
  const [open, setOpen] = useState(false)
  const Icon = call.name === 'search_palace' ? Search
            : call.name === 'read_palace_drawer' ? BookOpen
            : Wrench
  const label = call.name === 'search_palace' ? 'palace search'
              : call.name === 'read_palace_drawer' ? 'palace read'
              : call.name === 'update_system_draft' ? 'draft updated'
              : call.name

  let preview = ''
  if (call.name === 'search_palace') preview = String(call.input.query || '')
  else if (call.name === 'read_palace_drawer') preview = String(call.input.drawer_id || '')
  else if (call.name === 'update_system_draft') preview = Object.keys(call.input).join(', ')

  return (
    <div
      className="mt-2 text-xxs font-mono"
      style={{ borderLeft: '2px solid var(--ember)', background: 'var(--ember-wash)' }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-1.5 text-left hover:bg-[var(--bg-3)] transition-colors"
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        <Icon className="h-3 w-3" style={{ color: 'var(--ember)' }} />
        <span className="uppercase tracking-button" style={{ color: 'var(--ember)' }}>{label}</span>
        {preview && <span className="truncate" style={{ color: 'var(--ink-dim)' }}>· {preview}</span>}
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-2 pt-1 space-y-1.5">
              <div>
                <div className="kicker mb-0.5" style={{ color: 'var(--ink-faint)', letterSpacing: '0.18em' }}>input</div>
                <pre className="text-xxs whitespace-pre-wrap break-all" style={{ color: 'var(--ink-dim)' }}>
                  {JSON.stringify(call.input, null, 2)}
                </pre>
              </div>
              {result !== undefined && (
                <div>
                  <div className="kicker mb-0.5" style={{ color: 'var(--ink-faint)', letterSpacing: '0.18em' }}>result</div>
                  <pre className="text-xxs whitespace-pre-wrap break-all" style={{ color: 'var(--ink-dim)' }}>
                    {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}


function MessageBubble({ turn }: { turn: RenderedTurn }) {
  const isUser = turn.role === 'user'
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.18 }}
      className={`flex flex-col gap-1 ${isUser ? 'items-end' : 'items-start'}`}
    >
      <div className="kicker text-xxs" style={{ color: 'var(--ink-faint)' }}>
        {isUser ? 'andrei' : '⚙ assistant'}
      </div>
      <div
        className={`max-w-[88%] px-4 py-3 text-sm font-mono leading-relaxed whitespace-pre-wrap`}
        style={{
          background: isUser ? 'var(--bg-3)' : 'var(--bg-2)',
          border: '1px solid var(--line)',
          borderLeft: isUser ? '3px solid var(--ember)' : '3px solid var(--line-hot)',
          color: 'var(--ink)',
        }}
      >
        {turn.text || (turn.toolCalls.length > 0 ? <em style={{ color: 'var(--ink-faint)' }}>(working…)</em> : '')}
      </div>
      {turn.toolCalls.length > 0 && (
        <div className="w-full max-w-[88%]">
          {turn.toolCalls.map((c) => (
            <ToolCallStrip key={c.id} call={c} result={turn.toolResults[c.id]} />
          ))}
        </div>
      )}
    </motion.div>
  )
}


// ---- record panel ----------------------------------------------------------

function FieldKicker({ icon: Icon, label }: { icon: typeof Hash; label: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <Icon className="h-3 w-3" style={{ color: 'var(--ember)' }} />
      <span className="kicker text-xxs" style={{ color: 'var(--ink-faint)' }}>§ {label}</span>
    </div>
  )
}


function RecordPanel({
  system, onSave, isSaving, recentlyChangedKeys,
}: {
  system: System
  onSave: (patch: Partial<System>) => void
  isSaving: boolean
  recentlyChangedKeys: Set<string>
}) {
  const [draft, setDraft] = useState<Partial<System>>({})
  const dirty = Object.keys(draft).length > 0

  const merged: System = { ...system, ...draft }

  const setField = <K extends keyof System>(k: K, v: System[K]) =>
    setDraft((d) => ({ ...d, [k]: v }))

  const save = () => {
    if (!dirty) return
    onSave(draft)
    setDraft({})
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-6 py-5 border-b border-[var(--line)] flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="kicker mb-1" style={{ color: 'var(--ink-faint)' }}>§ Living Record</div>
          <input
            value={merged.name}
            onChange={(e) => setField('name', e.target.value)}
            className="w-full bg-transparent border-none p-0 text-2xl font-serif italic"
            style={{
              color: 'var(--ink)',
              fontVariationSettings: '"opsz" 144, "SOFT" 80, "wght" 380',
            }}
          />
          <div className="flex items-center gap-2 mt-1">
            <span className="text-xxs font-mono" style={{ color: 'var(--ink-faint)' }}>
              /{merged.slug}
            </span>
            <span className="text-xxs font-mono uppercase tracking-button" style={{ color: 'var(--ink-faint)' }}>
              ·
            </span>
            <select
              value={merged.status}
              onChange={(e) => setField('status', e.target.value)}
              className="text-xxs font-mono uppercase tracking-button bg-transparent border-none p-0"
              style={{ color: 'var(--ember)' }}
            >
              <option value="draft">draft</option>
              <option value="active">active</option>
              <option value="archived">archived</option>
            </select>
          </div>
        </div>
        <Button onClick={save} loading={isSaving} disabled={!dirty} size="sm">
          <Save className="h-3 w-3" /> {dirty ? 'Save' : 'Saved'}
        </Button>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* Category */}
        <div>
          <FieldKicker icon={Tag} label="Category" />
          <input
            value={merged.category || ''}
            onChange={(e) => setField('category', e.target.value || null)}
            placeholder="server / vm / saas / monitoring / secrets / identity"
            className="input-field"
          />
        </div>

        {/* Short description */}
        <div className={recentlyChangedKeys.has('short_description') ? 'flash-field' : ''}>
          <FieldKicker icon={FileText} label="One-Liner" />
          <textarea
            value={merged.short_description || ''}
            onChange={(e) => setField('short_description', e.target.value || null)}
            placeholder="One sentence. The assistant will refine this."
            rows={2}
            className="input-field resize-none"
          />
        </div>

        {/* Tags */}
        <div className={recentlyChangedKeys.has('tags') ? 'flash-field' : ''}>
          <FieldKicker icon={Hash} label="Tags" />
          <TagsEditor
            tags={merged.tags || []}
            onChange={(tags) => setField('tags', tags)}
          />
        </div>

        {/* Snippets */}
        <div className={recentlyChangedKeys.has('snippets') ? 'flash-field' : ''}>
          <FieldKicker icon={Database} label="Facts" />
          <SnippetsEditor
            snippets={(merged.snippets as Record<string, unknown>) || {}}
            onChange={(snippets) => setField('snippets', snippets)}
          />
        </div>

        {/* Palace links */}
        {(merged.palace_drawer_ids?.length || 0) > 0 && (
          <div className={recentlyChangedKeys.has('palace_drawer_ids') ? 'flash-field' : ''}>
            <FieldKicker icon={Brain} label="Palace Links" />
            <div className="flex flex-wrap gap-1.5">
              {merged.palace_drawer_ids.map((id) => (
                <span key={id} className="badge-instrument" style={{ color: 'var(--ember)' }}>
                  {id}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Body */}
        <div className={recentlyChangedKeys.has('body') ? 'flash-field' : ''}>
          <FieldKicker icon={BookOpen} label="Long-Form" />
          <textarea
            value={merged.body || ''}
            onChange={(e) => setField('body', e.target.value || null)}
            placeholder="Markdown. Architecture, gotchas, runbooks…"
            rows={14}
            className="input-field resize-y font-mono text-xs"
            style={{ minHeight: '300px' }}
          />
        </div>
      </div>
    </div>
  )
}


function TagsEditor({ tags, onChange }: { tags: string[]; onChange: (t: string[]) => void }) {
  const [input, setInput] = useState('')
  const add = () => {
    const v = input.trim()
    if (!v || tags.includes(v)) return
    onChange([...tags, v].sort())
    setInput('')
  }
  return (
    <div>
      <div className="flex flex-wrap gap-1.5 mb-2">
        {tags.map((t) => (
          <span
            key={t}
            className="badge-instrument cursor-pointer"
            style={{ color: 'var(--ink-dim)' }}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            title="Click to remove"
          >
            <Hash className="h-2.5 w-2.5 mr-1" /> {t} <span className="ml-1 opacity-50">×</span>
          </span>
        ))}
      </div>
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); add() } }}
        placeholder="add tag, press enter"
        className="input-field"
      />
    </div>
  )
}


function SnippetsEditor({
  snippets, onChange,
}: {
  snippets: Record<string, unknown>
  onChange: (s: Record<string, unknown>) => void
}) {
  const [newKey, setNewKey] = useState('')
  const [newVal, setNewVal] = useState('')
  const entries = Object.entries(snippets)

  const update = (k: string, v: string) => onChange({ ...snippets, [k]: v })
  const remove = (k: string) => {
    const cp = { ...snippets }
    delete cp[k]
    onChange(cp)
  }
  const addNew = () => {
    if (!newKey.trim()) return
    onChange({ ...snippets, [newKey.trim()]: newVal })
    setNewKey(''); setNewVal('')
  }

  return (
    <div className="border border-[var(--line)]">
      {entries.length === 0 && (
        <div className="px-3 py-2 text-xxs font-mono" style={{ color: 'var(--ink-faint)' }}>
          No facts yet. The assistant will populate these as you chat.
        </div>
      )}
      {entries.map(([k, v]) => (
        <div key={k} className="flex items-stretch border-b border-[var(--line)] last:border-b-0">
          <div
            className="px-3 py-2 text-xxs font-mono uppercase tracking-button shrink-0 w-40"
            style={{ color: 'var(--ember)', borderRight: '1px solid var(--line)', background: 'var(--ember-wash)' }}
          >
            {k}
          </div>
          <input
            value={String(v ?? '')}
            onChange={(e) => update(k, e.target.value)}
            className="flex-1 bg-transparent px-3 py-2 text-xs font-mono"
            style={{ color: 'var(--ink)', outline: 'none', border: 'none' }}
          />
          <button
            onClick={() => remove(k)}
            className="px-3 hover:bg-[var(--bg-3)] transition-colors"
            style={{ color: 'var(--ink-faint)' }}
            title="Remove"
          >
            ×
          </button>
        </div>
      ))}
      <div className="flex items-stretch" style={{ background: 'var(--bg-3)' }}>
        <input
          value={newKey}
          onChange={(e) => setNewKey(e.target.value)}
          placeholder="key"
          className="px-3 py-2 text-xxs font-mono uppercase tracking-button shrink-0 w-40 bg-transparent"
          style={{ color: 'var(--ink-dim)', borderRight: '1px solid var(--line)', outline: 'none', border: 'none' }}
        />
        <input
          value={newVal}
          onChange={(e) => setNewVal(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addNew() } }}
          placeholder="value"
          className="flex-1 bg-transparent px-3 py-2 text-xs font-mono"
          style={{ color: 'var(--ink-dim)', outline: 'none', border: 'none' }}
        />
        <button
          onClick={addNew}
          className="px-3 hover:bg-[var(--bg-2)] transition-colors text-xxs font-mono uppercase tracking-button"
          style={{ color: 'var(--ember)' }}
        >
          + add
        </button>
      </div>
    </div>
  )
}


// ---- main ------------------------------------------------------------------

export default function SystemDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [draft, setDraft] = useState('')
  const [recentlyChangedKeys, setRecentlyChangedKeys] = useState<Set<string>>(new Set())

  const { data: system, isLoading: sysLoading } = useQuery({
    queryKey: ['systems', id],
    queryFn: () => getSystem(id!),
    enabled: !!id,
  })

  const { data: messages = [], isLoading: msgLoading } = useQuery({
    queryKey: ['systems', id, 'chat'],
    queryFn: () => getSystemChat(id!),
    enabled: !!id,
  })

  const turns = useMemo(() => flattenMessages(messages), [messages])

  const sendMut = useMutation({
    mutationFn: (text: string) => sendSystemChatMessage(id!, text),
    onSuccess: (turn) => {
      // Surface which fields were touched so we can flash them in the record panel
      const changed = new Set<string>()
      for (const ev of turn.tool_events) {
        if (ev.name === 'update_system_draft') {
          const out = ev.output as { applied?: Record<string, unknown> } | null
          for (const k of Object.keys(out?.applied || {})) changed.add(k)
        }
      }
      setRecentlyChangedKeys(changed)
      setTimeout(() => setRecentlyChangedKeys(new Set()), 1500)
      queryClient.setQueryData(['systems', id], turn.system)
      queryClient.invalidateQueries({ queryKey: ['systems', id, 'chat'] })
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      setDraft('')
    },
    onError: (e: unknown) => {
      const msg = (e as { response?: { data?: { detail?: string } }; message?: string })?.response?.data?.detail
        || (e as { message?: string })?.message
        || 'Chat failed'
      toast.error(msg)
    },
  })

  const saveMut = useMutation({
    mutationFn: (patch: Partial<System>) => updateSystem(id!, patch),
    onSuccess: (sys) => {
      queryClient.setQueryData(['systems', id], sys)
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      toast.success('Saved')
    },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteSystem(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['systems'] })
      toast.success('Deleted')
      navigate('/systems')
    },
  })

  // Scroll to bottom on new turns
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, sendMut.isPending])

  if (sysLoading || !system) {
    return <div className="flex justify-center py-16"><Spinner size="lg" /></div>
  }

  const send = () => {
    const t = draft.trim()
    if (!t || sendMut.isPending) return
    sendMut.mutate(t)
  }

  return (
    <div className="-mx-4 -my-6 lg:-mx-6 h-[calc(100vh-68px)] flex flex-col">
      <style>{`
        .flash-field { animation: flashEmber 1.4s ease-out; }
        @keyframes flashEmber {
          0%   { background: var(--ember-wash); }
          100% { background: transparent; }
        }
      `}</style>

      {/* Top crumbs */}
      <div className="px-6 py-3 border-b border-[var(--line)] flex items-center justify-between" style={{ background: 'var(--bg-2)' }}>
        <div className="flex items-center gap-3 text-xxs font-mono uppercase tracking-button">
          <Link to="/systems" className="flex items-center gap-1.5" style={{ color: 'var(--ink-faint)' }}>
            <ArrowLeft className="h-3 w-3" /> Systems
          </Link>
          <span style={{ color: 'var(--ink-faint)' }}>/</span>
          <span style={{ color: 'var(--ink)' }}>{system.name}</span>
        </div>
        <button
          onClick={() => { if (confirm(`Delete "${system.name}"?`)) deleteMut.mutate() }}
          className="text-xxs font-mono uppercase tracking-button flex items-center gap-1.5 hover:text-[var(--red)] transition-colors"
          style={{ color: 'var(--ink-faint)' }}
        >
          <Trash2 className="h-3 w-3" /> Delete
        </button>
      </div>

      {/* Split layout */}
      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] overflow-hidden">
        {/* CHAT */}
        <div className="flex flex-col border-r border-[var(--line)] overflow-hidden">
          <div className="px-6 py-4 border-b border-[var(--line)] flex items-center gap-2" style={{ background: 'var(--bg-2)' }}>
            <Sparkles className="h-3.5 w-3.5" style={{ color: 'var(--ember)' }} />
            <span className="kicker" style={{ color: 'var(--ink)' }}>§ Conversation</span>
            <span className="text-xxs font-mono ml-auto" style={{ color: 'var(--ink-faint)' }}>
              {turns.length} turn{turns.length === 1 ? '' : 's'}
            </span>
          </div>

          <div ref={scrollRef} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
            {msgLoading ? (
              <div className="flex justify-center py-8"><Spinner /></div>
            ) : turns.length === 0 ? (
              <div className="empty-instrument max-w-md mx-auto mt-8">
                <Sparkles className="h-8 w-8 mx-auto mb-3" style={{ color: 'var(--ember)' }} />
                <div className="kicker mb-2">§ Start The Conversation</div>
                <p className="text-xs font-mono leading-relaxed" style={{ color: 'var(--ink-dim)' }}>
                  Tell the assistant what this system is. It'll search MemPalace,
                  draft the record, and ask focused questions to fill in the rest.
                </p>
              </div>
            ) : (
              turns.map((t, i) => <MessageBubble key={i} turn={t} />)
            )}

            {sendMut.isPending && (
              <div className="flex items-center gap-2 text-xxs font-mono" style={{ color: 'var(--ink-faint)' }}>
                <Loader2 className="h-3 w-3 animate-spin" style={{ color: 'var(--ember)' }} />
                <span className="uppercase tracking-button">working…</span>
              </div>
            )}
          </div>

          {/* Composer */}
          <div className="border-t border-[var(--line)] p-4" style={{ background: 'var(--bg-2)' }}>
            <div className="relative">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    e.preventDefault(); send()
                  }
                }}
                placeholder="Tell me about this system… (⌘↵ to send)"
                rows={3}
                className="input-field resize-none pr-24"
              />
              <button
                onClick={send}
                disabled={!draft.trim() || sendMut.isPending}
                className="absolute bottom-2 right-2 btn-base btn-primary"
                style={{ padding: '6px 12px', fontSize: '10px' }}
              >
                {sendMut.isPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />}
                Send
              </button>
            </div>
          </div>
        </div>

        {/* RECORD */}
        <div className="overflow-hidden" style={{ background: 'var(--bg-2)' }}>
          <RecordPanel
            system={system}
            onSave={(patch) => saveMut.mutate(patch)}
            isSaving={saveMut.isPending}
            recentlyChangedKeys={recentlyChangedKeys}
          />
        </div>
      </div>
    </div>
  )
}
