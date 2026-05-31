import client from './client'
import type { UptimeSettings, UptimeMonitorsResponse } from '@/types'

export const getUptimeSettings = async () => {
  const { data } = await client.get<UptimeSettings>('/uptime/settings')
  return data
}

export const saveUptimeSettings = async (body: { url: string; api_key: string }) => {
  const { data } = await client.put<UptimeSettings>('/uptime/settings', body)
  return data
}

export const testUptimeConnection = async () => {
  const { data } = await client.post<{
    success: boolean
    monitor_count: number
    error: string | null
  }>('/uptime/test')
  return data
}

export const getUptimeMonitors = async (force = false) => {
  const { data } = await client.get<UptimeMonitorsResponse>('/uptime/monitors', {
    params: force ? { force: true } : undefined,
  })
  return data
}
