import client from './client'
import type { Flag } from '@/types'

export const getFlags = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Flag[]>('/flags', { params })
  return data
}

export const createFlag = async (body: Record<string, unknown>) => {
  const { data } = await client.post<Flag>('/flags', body)
  return data
}

export const deleteFlag = async (id: string) => {
  await client.delete(`/flags/${id}`)
}
