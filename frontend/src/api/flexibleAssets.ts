import client from './client'
import type { FlexibleAssetType, FlexibleAsset } from '@/types'

export const getFlexibleAssetTypes = async () => {
  const { data } = await client.get<FlexibleAssetType[]>('/flexible-asset-types')
  return data
}

export const getFlexibleAssetType = async (id: string) => {
  const { data } = await client.get<FlexibleAssetType>(`/flexible-asset-types/${id}`)
  return data
}

export const createFlexibleAssetType = async (body: Record<string, unknown>) => {
  const { data } = await client.post<FlexibleAssetType>('/flexible-asset-types', body)
  return data
}

export const updateFlexibleAssetType = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<FlexibleAssetType>(`/flexible-asset-types/${id}`, body)
  return data
}

export const deleteFlexibleAssetType = async (id: string) => {
  await client.delete(`/flexible-asset-types/${id}`)
}

export const getFlexibleAssets = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<FlexibleAsset[]>('/flexible-assets', { params })
  return data
}

export const getFlexibleAsset = async (id: string) => {
  const { data } = await client.get<FlexibleAsset>(`/flexible-assets/${id}`)
  return data
}

export const createFlexibleAsset = async (body: Record<string, unknown>) => {
  const { data } = await client.post<FlexibleAsset>('/flexible-assets', body)
  return data
}

export const updateFlexibleAsset = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<FlexibleAsset>(`/flexible-assets/${id}`, body)
  return data
}

export const deleteFlexibleAsset = async (id: string) => {
  await client.delete(`/flexible-assets/${id}`)
}
