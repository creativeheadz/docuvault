import { Link, useLocation } from 'react-router-dom'
import { ChevronRight, Home } from 'lucide-react'

export function Breadcrumbs() {
  const location = useLocation()
  const segments = location.pathname.split('/').filter(Boolean)

  return (
    <nav className="flex items-center gap-1 text-sm text-gray-500 dark:text-gray-400">
      <Link to="/dashboard" className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">
        <Home className="h-4 w-4" />
      </Link>
      {segments.map((seg, i) => {
        const path = '/' + segments.slice(0, i + 1).join('/')
        const label = seg.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
        const isLast = i === segments.length - 1
        return (
          <span key={path} className="flex items-center gap-1">
            <ChevronRight className="h-3 w-3" />
            {isLast ? (
              <span className="text-gray-900 dark:text-white font-medium">{label}</span>
            ) : (
              <Link to={path} className="hover:text-gray-700 dark:hover:text-gray-200 transition-colors">{label}</Link>
            )}
          </span>
        )
      })}
    </nav>
  )
}
