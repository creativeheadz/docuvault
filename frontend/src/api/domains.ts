import client from './client'
import type { Domain } from '@/types'

export const getDomains = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Domain[]>('/domains', { params })
  return data
}

export const getDomain = async (id: string) => {
  const { data } = await client.get<Domain>(`/domains/${id}`)
  return data
}

export const createDomain = async (body: Partial<Domain>) => {
  const { data } = await client.post<Domain>('/domains', body)
  return data
}

export const updateDomain = async (id: string, body: Partial<Domain>) => {
  const { data } = await client.put<Domain>(`/domains/${id}`, body)
  return data
}

export const deleteDomain = async (id: string) => {
  await client.delete(`/domains/${id}`)
}
