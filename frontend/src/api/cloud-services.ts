import client from './client'
import type { CloudService, CloudServiceStats } from '@/types'

export interface ListCloudServicesParams {
  organization_id?: string
  status?: string
  include_archived?: boolean
  overdue_only?: boolean
}

export const getCloudServices = async (params?: ListCloudServicesParams) => {
  const { data } = await client.get<CloudService[]>('/cloud-services', { params })
  return data
}

export const getCloudService = async (id: string) => {
  const { data } = await client.get<CloudService>(`/cloud-services/${id}`)
  return data
}

export const createCloudService = async (body: Partial<CloudService>) => {
  const { data } = await client.post<CloudService>('/cloud-services', body)
  return data
}

export const updateCloudService = async (id: string, body: Partial<CloudService>) => {
  const { data } = await client.put<CloudService>(`/cloud-services/${id}`, body)
  return data
}

export const deleteCloudService = async (id: string) => {
  await client.delete(`/cloud-services/${id}`)
}

export const reviewCloudService = async (
  id: string,
  body: { reviewed_on?: string; extend_months?: number; notes?: string },
) => {
  const { data } = await client.post<CloudService>(`/cloud-services/${id}/review`, body)
  return data
}

export const getCloudServicesStats = async () => {
  const { data } = await client.get<CloudServiceStats>('/cloud-services/stats')
  return data
}

export const exportCloudServicesCsvUrl = () => '/api/v1/cloud-services/export.csv'
