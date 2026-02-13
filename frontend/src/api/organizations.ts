import client from './client'
import type { Organization, PaginatedResponse } from '@/types'

export async function getOrganizations(params?: {
  page?: number
  page_size?: number
  search?: string
}): Promise<PaginatedResponse<Organization>> {
  const { data } = await client.get<PaginatedResponse<Organization>>('/organizations', { params })
  return data
}

export async function getOrganization(id: string): Promise<Organization> {
  const { data } = await client.get<Organization>(`/organizations/${id}`)
  return data
}

export async function createOrganization(body: Partial<Organization>): Promise<Organization> {
  const { data } = await client.post<Organization>('/organizations', body)
  return data
}

export async function updateOrganization(id: string, body: Partial<Organization>): Promise<Organization> {
  const { data } = await client.put<Organization>(`/organizations/${id}`, body)
  return data
}

export async function deleteOrganization(id: string): Promise<void> {
  await client.delete(`/organizations/${id}`)
}
