import client from './client'
import type { MapGraphSave, MapPlacement, NetworkMapDetail, NetworkMapSummary } from '@/types'

export const getNetworkMaps = async (params?: { organization_id?: string }) => {
  const { data } = await client.get<NetworkMapSummary[]>('/network-maps', { params })
  return data
}

export const getNetworkMap = async (id: string) => {
  const { data } = await client.get<NetworkMapDetail>(`/network-maps/${id}`)
  return data
}

export const createNetworkMap = async (body: {
  organization_id: string
  name: string
  description?: string | null
  location_id?: string | null
}) => {
  const { data } = await client.post<NetworkMapDetail>('/network-maps', body)
  return data
}

export const updateNetworkMap = async (
  id: string,
  body: { name?: string; description?: string | null; location_id?: string | null },
) => {
  const { data } = await client.put<NetworkMapSummary>(`/network-maps/${id}`, body)
  return data
}

/** Saves the whole drawing. A 409 means someone else saved since `version`. */
export const saveNetworkMapGraph = async (id: string, body: MapGraphSave) => {
  const { data } = await client.put<{ version: number; updated_at: string }>(`/network-maps/${id}/graph`, body)
  return data
}

export const deleteNetworkMap = async (id: string) => {
  await client.delete(`/network-maps/${id}`)
}

export const getMapPlacements = async (params?: { system_id?: string }) => {
  const { data } = await client.get<MapPlacement[]>('/network-maps/placements', { params })
  return data
}
