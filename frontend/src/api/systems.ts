import client from './client'
import type { System, SystemChatMessage, SystemChatTurn } from '@/types'

export const getSystems = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<System[]>('/systems', { params })
  return data
}

export const getSystem = async (id: string) => {
  const { data } = await client.get<System>(`/systems/${id}`)
  return data
}

export const createSystem = async (body: Partial<System>) => {
  const { data } = await client.post<System>('/systems', body)
  return data
}

export const updateSystem = async (id: string, body: Partial<System>) => {
  const { data } = await client.put<System>(`/systems/${id}`, body)
  return data
}

export const deleteSystem = async (id: string) => {
  await client.delete(`/systems/${id}`)
}

export const getSystemChat = async (id: string) => {
  const { data } = await client.get<SystemChatMessage[]>(`/systems/${id}/chat`)
  return data
}

export const sendSystemChatMessage = async (id: string, message: string) => {
  const { data } = await client.post<SystemChatTurn>(`/systems/${id}/chat`, { message })
  return data
}
