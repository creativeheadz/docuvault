import { useState } from 'react'
import { useThemeStore } from '@/store/themeStore'
import { Card, CardHeader, CardTitle } from '@/components/ui/Card'
import { Button } from '@/components/ui/Button'
import { Moon, Sun, Shield, Bell, Database, Palette, Network } from 'lucide-react'
import { MfaSetup } from '@/components/settings/MfaSetup'
import { MeshCentralSettings } from '@/components/settings/MeshCentralSettings'

export default function SettingsPage() {
  const { dark, toggle } = useThemeStore()

  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Settings</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Palette className="h-5 w-5 text-primary-500" />
              <CardTitle>Appearance</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="flex items-center gap-3">
                {dark ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
                <div>
                  <div className="font-medium text-sm">Dark Mode</div>
                  <div className="text-xs text-gray-500">Toggle between light and dark themes</div>
                </div>
              </div>
              <button
                onClick={toggle}
                className={`relative w-11 h-6 rounded-full transition-colors ${dark ? 'bg-primary-600' : 'bg-gray-300'}`}
              >
                <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white transition-transform ${dark ? 'translate-x-5' : ''}`} />
              </button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Shield className="h-5 w-5 text-primary-500" />
              <CardTitle>Security</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <MfaSetup />
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="font-medium text-sm">IP Whitelisting</div>
              <div className="text-xs text-gray-500 mt-1">Restrict access to specific IP addresses</div>
              <Button variant="secondary" size="sm" className="mt-2">Manage IPs</Button>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Bell className="h-5 w-5 text-primary-500" />
              <CardTitle>Webhooks</CardTitle>
            </div>
          </CardHeader>
          <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
            <div className="font-medium text-sm">Event Notifications</div>
            <div className="text-xs text-gray-500 mt-1">Configure webhooks for real-time event notifications</div>
            <Button variant="secondary" size="sm" className="mt-2">Manage Webhooks</Button>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Network className="h-5 w-5 text-primary-500" />
              <CardTitle>MeshCentral</CardTitle>
            </div>
          </CardHeader>
          <MeshCentralSettings />
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Database className="h-5 w-5 text-primary-500" />
              <CardTitle>Data Management</CardTitle>
            </div>
          </CardHeader>
          <div className="space-y-3">
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="font-medium text-sm">Import / Export</div>
              <div className="text-xs text-gray-500 mt-1">Bulk import or export data via CSV/Excel</div>
              <div className="flex gap-2 mt-2">
                <Button variant="secondary" size="sm">Import</Button>
                <Button variant="secondary" size="sm">Export</Button>
              </div>
            </div>
            <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <div className="font-medium text-sm">Backup</div>
              <div className="text-xs text-gray-500 mt-1">Create and manage database backups</div>
              <Button variant="secondary" size="sm" className="mt-2">Create Backup</Button>
            </div>
          </div>
        </Card>
      </div>
    </div>
  )
}
