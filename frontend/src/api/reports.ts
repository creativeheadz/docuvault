import client from './client'

export interface CoverageReport {
  counts: Record<string, number>
  total: number
}

export interface ActivityEntry {
  id: string
  entity_type: string
  entity_id: string
  action: string
  changes: Record<string, unknown> | null
  user_id: string | null
  ip_address: string | null
  created_at: string
}

export const getCoverageReport = async () => {
  const { data } = await client.get<CoverageReport>('/reports/coverage')
  return data
}

export const getActivityReport = async (limit = 50) => {
  const { data } = await client.get<ActivityEntry[]>('/reports/activity', { params: { limit } })
  return data
}
