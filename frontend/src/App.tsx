import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useAuthStore } from '@/store/authStore'
import { useAuth } from '@/hooks/useAuth'
import { AppLayout } from '@/components/layout/AppLayout'
import { CommandPalette } from '@/components/layout/CommandPalette'
import { ToastProvider } from '@/components/ui/Toast'
import { Spinner } from '@/components/ui/Spinner'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import OrganizationsPage from '@/pages/OrganizationsPage'
import LocationsPage from '@/pages/LocationsPage'
import ContactsPage from '@/pages/ContactsPage'
import ConfigurationsPage from '@/pages/ConfigurationsPage'
import PasswordsPage from '@/pages/PasswordsPage'
import DomainsPage from '@/pages/DomainsPage'
import SSLCertificatesPage from '@/pages/SSLCertificatesPage'
import DocumentsPage from '@/pages/DocumentsPage'
import FlexibleAssetsPage from '@/pages/FlexibleAssetsPage'
import ChecklistsPage from '@/pages/ChecklistsPage'
import RunbooksPage from '@/pages/RunbooksPage'
import ReportsPage from '@/pages/ReportsPage'
import FlagsPage from '@/pages/FlagsPage'
import SearchResultsPage from '@/pages/SearchResultsPage'
import SettingsPage from '@/pages/SettingsPage'
import NotFoundPage from '@/pages/NotFoundPage'
import { type ReactNode } from 'react'

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
})

function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated } = useAuthStore()
  const { isLoading } = useAuth()

  if (!isAuthenticated) return <Navigate to="/login" replace />
  if (isLoading) return <div className="min-h-screen flex items-center justify-center"><Spinner size="lg" /></div>
  return <>{children}</>
}

function AppRoutes() {
  const { isAuthenticated } = useAuthStore()

  return (
    <Routes>
      <Route path="/login" element={isAuthenticated ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
      <Route element={<RequireAuth><AppLayout /></RequireAuth>}>
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/organizations/*" element={<OrganizationsPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/contacts" element={<ContactsPage />} />
        <Route path="/configurations" element={<ConfigurationsPage />} />
        <Route path="/passwords" element={<PasswordsPage />} />
        <Route path="/domains" element={<DomainsPage />} />
        <Route path="/ssl-certificates" element={<SSLCertificatesPage />} />
        <Route path="/documents/*" element={<DocumentsPage />} />
        <Route path="/flexible-assets/*" element={<FlexibleAssetsPage />} />
        <Route path="/checklists" element={<ChecklistsPage />} />
        <Route path="/runbooks" element={<RunbooksPage />} />
        <Route path="/reports" element={<ReportsPage />} />
        <Route path="/flags" element={<FlagsPage />} />
        <Route path="/search" element={<SearchResultsPage />} />
        <Route path="/settings/*" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider />
        <CommandPalette />
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  )
}
