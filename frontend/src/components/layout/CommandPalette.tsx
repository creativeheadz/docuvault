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
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="fixed inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-lg bg-white dark:bg-gray-800 rounded-xl shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-200 dark:border-gray-700">
          <Search className="h-5 w-5 text-gray-400" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search documentation..."
            className="flex-1 bg-transparent border-none outline-none text-sm placeholder:text-gray-400"
            autoFocus
          />
          <kbd className="text-xs bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded">Esc</kbd>
        </div>
        {results.length > 0 && (
          <div className="max-h-80 overflow-y-auto py-2">
            {results.map((r, idx) => {
              const Icon = entityIcons[r.entity_type] || Building2
              return (
                <button
                  key={`${r.entity_type}-${r.entity_id}`}
                  onClick={() => handleSelect(r)}
                  onMouseEnter={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${idx === selectedIdx ? 'bg-primary-50 dark:bg-primary-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-700/50'}`}
                >
                  <Icon className="h-4 w-4 text-gray-400 shrink-0" />
                  <span className="text-sm font-medium truncate">{r.name}</span>
                  <Badge className="ml-auto text-[10px]">{r.entity_type.replace('_', ' ')}</Badge>
                </button>
              )
            })}
          </div>
        )}
        {query && !results.length && (
          <div className="py-8 text-center text-sm text-gray-400">No results found</div>
        )}
      </div>
    </div>
  )
}
