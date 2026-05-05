import { Link, useLocation } from 'react-router-dom'
import { Home } from 'lucide-react'

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-2 font-mono text-xxs uppercase tracking-kicker text-ink-faint">
      <Link to="/dashboard" className="hover:text-ember transition-colors flex items-center" aria-label="Home">
        <Home className="h-3 w-3" />
      </Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const label = seg.replace(/-/g, ' ')
        const isLast = i === segments.length - 1
        return (
          <span key={path} className="flex items-center gap-2">
            <span className="text-line-hot">/</span>
            {isLast ? (
              <span className="text-ember">{label}</span>
            ) : (
              <Link to={path} className="hover:text-ink transition-colors">{label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
