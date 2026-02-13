import { useQuery } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { getMe } from '@/api/auth'
import { useEffect } from 'react'

export function useAuth() {
  const { user, isAuthenticated, setUser, clearAuth } = useAuthStore()

  const { data, isLoading, error } = useQuery({
    queryKey: ['me'],
    queryFn: getMe,
    enabled: isAuthenticated && !user,
    retry: false,
  })

  useEffect(() => {
    if (data) setUser(data)
    if (error) clearAuth()
  }, [data, error, setUser, clearAuth])

  return { user: user || data, isLoading, isAuthenticated }
}
