import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch, type SearchResult } from '@/api/search'
import { Badge } from '@/components/ui/Badge'
import { Search, Building2, Server, KeyRound, FileText, Globe, ShieldCheck, Users, MapPin } from 'lucide-react'

const entityIcons: Record<string, typeof Building2> = {
  organization: Building2, configuration: Server, password: KeyRound, document: FileText,
  domain: Globe, ssl_certificate: ShieldCheck, contact: Users, location: MapPin,
}

const entityRoutes: Record<string, string> = {
  organization: '/organizations', configuration: '/configurations', password: '/passwords',
  document: '/documents', domain: '/domains', ssl_certificate: '/ssl-certificates',
  contact: '/contacts', location: '/locations',
}

export function CommandPalette() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [selectedIdx, setSelectedIdx] = useState(0)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setOpen((o) => !o)
      }
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const data = await globalSearch(q)
      setResults(data.results.slice(0, 10))
      setSelectedIdx(0)
    } catch { setResults([]) }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 200)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  const handleSelect = (r: SearchResult) => {
    setOpen(false)
    setQuery('')
    navigate(`${entityRoutes[r.entity_type] || '/dashboard'}/${r.entity_id}`)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelectedIdx((i) => Math.min(i + 1, results.length - 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelectedIdx((i) => Math.max(i - 1, 0)) }
    if (e.key === 'Enter' && results[selectedIdx]) { handleSelect(results[selectedIdx]) }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[18vh]">
      <div className="fixed inset-0 bg-black/75 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
      <div className="modal-panel relative w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-line">
          <Search className="h-4 w-4 text-ink-faint" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation…"
            className="flex-1 bg-transparent border-none outline-none font-mono text-sm text-ink placeholder:text-ink-faint"
            autoFocus
          />
          <span className="font-mono text-[10px] uppercase tracking-kicker text-ink-faint border border-line-hot px-1.5 py-0.5">Esc</span>
        </div>
        {results.length > 0 && (
          <div className="max-h-[60vh] overflow-y-auto py-1">
            {results.map((r, idx) => {
              const Icon = entityIcons[r.entity_type] || Building2
              const active = idx === selectedIdx
              return (
                <button
                  key={`${r.entity_type}-${r.entity_id}`}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-5 py-2.5 text-left transition-colors border-l-[3px] ${
                    active
                      ? 'border-ember bg-ember-wash text-ink'
                      : 'border-transparent text-ink-dim hover:text-ink hover:bg-surface-sunken'
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 shrink-0 ${active ? 'text-ember' : 'text-ink-faint'}`} />
                  <span className="font-mono text-sm truncate flex-1">{r.name}</span>
                  <Badge variant={active ? 'ember' : 'default'}>{r.entity_type.replace('_', ' ')}</Badge>
                </button>
              )
            })}
          </div>
        )}
        {query && !results.length && (
          <div className="py-10 text-center font-mono text-xs uppercase tracking-kicker text-ink-faint">
            · No results ·
          </div>
        )}
        {!query && (
          <div className="py-8 px-5 font-mono text-[11px] uppercase tracking-kicker text-ink-faint flex items-center justify-between">
            <span>· Type to search ·</span>
            <span className="flex items-center gap-2">
              <kbd className="border border-line-hot px-1.5 py-0.5">↑</kbd>
              <kbd className="border border-line-hot px-1.5 py-0.5">↓</kbd>
              <span>navigate</span>
              <kbd className="border border-line-hot px-1.5 py-0.5 ml-2">↵</kbd>
              <span>open</span>
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
