import client from './client'
import type { BaselineApplication, BaselineStats } from '@/types'

export const getAllBaselineApplications = async () => {
  const { data } = await client.get<BaselineApplication[]>('/baselines/applications')
  return data
}

export const getBaselinesForSystem = async (systemId: string) => {
  const { data } = await client.get<BaselineApplication[]>(`/baselines/by-system/${systemId}`)
  return data
}

export const applyBaseline = async (
  systemId: string,
  body: { checklist_id: string; review_period_months?: number; last_verified_date?: string },
) => {
  const { data } = await client.post<BaselineApplication>(`/baselines/by-system/${systemId}`, body)
  return data
}

export const verifyBaselineApplication = async (
  applicationId: string,
  body: { verified_on?: string; notes?: string },
) => {
  const { data } = await client.post<BaselineApplication>(`/baselines/applications/${applicationId}/verify`, body)
  return data
}

export const removeBaselineApplication = async (applicationId: string) => {
  await client.delete(`/baselines/applications/${applicationId}`)
}

export const getBaselineStats = async () => {
  const { data } = await client.get<BaselineStats>('/baselines/stats')
  return data
}
