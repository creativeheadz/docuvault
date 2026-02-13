import client from './client'
import type { Configuration } from '@/types'

export const getConfigurations = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Configuration[]>('/configurations', { params })
  return data
}

export const getConfiguration = async (id: string) => {
  const { data } = await client.get<Configuration>(`/configurations/${id}`)
  return data
}

export const createConfiguration = async (body: Partial<Configuration>) => {
  const { data } = await client.post<Configuration>('/configurations', body)
  return data
}

export const updateConfiguration = async (id: string, body: Partial<Configuration>) => {
  const { data } = await client.put<Configuration>(`/configurations/${id}`, body)
  return data
}

export const deleteConfiguration = async (id: string) => {
  await client.delete(`/configurations/${id}`)
}
