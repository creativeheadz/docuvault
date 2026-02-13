import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/Button'

export default function NotFoundPage() {
  return (
    <div className="min-h-[60vh] flex flex-col items-center justify-center">
      <h1 className="text-6xl font-bold text-gray-200 dark:text-gray-700">404</h1>
      <p className="text-gray-500 mt-2 mb-6">Page not found</p>
      <Link to="/dashboard">
        <Button variant="secondary">Go to Dashboard</Button>
      </Link>
    </div>
  )
}
