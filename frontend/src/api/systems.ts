import client from './client'
import type { FleetReadiness, System, SystemChatMessage, SystemChatTurn } from '@/types'

export interface ListSystemsParams {
  search?: string
  organization_id?: string
  /** Only systems that belong to no organisation. */
  estate_only?: boolean
  include_archived?: boolean
  /** Came from, or is synced by, this source. */
  source?: string
}

/** Every matching system; the list is not paginated. */
export const getSystems = async (params?: ListSystemsParams) => {
  const { data } = await client.get<System[]>('/systems', { params })
  return data
}

export const getFleetReadiness = async () => {
  const { data } = await client.get<FleetReadiness>('/systems/fleet-readiness')
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
