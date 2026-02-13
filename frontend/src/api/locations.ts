import client from './client'
import type { Location } from '@/types'

export const getLocations = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Location[]>('/locations', { params })
  return data
}

export const getLocation = async (id: string) => {
  const { data } = await client.get<Location>(`/locations/${id}`)
  return data
}

export const createLocation = async (body: Partial<Location>) => {
  const { data } = await client.post<Location>('/locations', body)
  return data
}

export const updateLocation = async (id: string, body: Partial<Location>) => {
  const { data } = await client.put<Location>(`/locations/${id}`, body)
  return data
}

export const deleteLocation = async (id: string) => {
  await client.delete(`/locations/${id}`)
}
