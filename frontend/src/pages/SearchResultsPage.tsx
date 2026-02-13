import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { globalSearch, type SearchResult } from '@/api/search'
import { Input } from '@/components/ui/Input'
import { Spinner } from '@/components/ui/Spinner'
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

export default function SearchResultsPage() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [total, setTotal] = useState(0)

  const doSearch = useCallback(async (q: string) => {
    if (!q.trim()) { setResults([]); setTotal(0); return }
    setLoading(true)
    try {
      const data = await globalSearch(q)
      setResults(data.results)
      setTotal(data.total)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => doSearch(query), 300)
    return () => clearTimeout(timer)
  }, [query, doSearch])

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-4">Search</h1>
        <div className="relative max-w-xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search across all documentation..."
            className="input-field pl-10 text-base py-3"
            autoFocus
          />
        </div>
      </div>

      {loading && <div className="flex justify-center py-8"><Spinner /></div>}

      {!loading && query && (
        <div className="mb-3 text-sm text-gray-500">{total} results found</div>
      )}

      <div className="space-y-2">
        {results.map((r) => {
          const Icon = entityIcons[r.entity_type] || Building2
          return (
            <div
              key={`${r.entity_type}-${r.entity_id}`}
              onClick={() => navigate(`${entityRoutes[r.entity_type] || '/dashboard'}/${r.entity_id}`)}
              className="card p-4 cursor-pointer hover:shadow-md transition-shadow flex items-center gap-3"
            >
              <Icon className="h-5 w-5 text-primary-500 shrink-0" />
              <span className="font-medium text-gray-900 dark:text-white">{r.name}</span>
              <Badge>{r.entity_type.replace('_', ' ')}</Badge>
            </div>
          )
        })}
      </div>
    </div>
  )
}
