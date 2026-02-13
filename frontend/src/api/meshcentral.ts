import client from './client'
import type { MeshCentralSettings, MeshSyncResult, MeshRemoteUrls } from '@/types'

export const getMeshSettings = async () => {
  const { data } = await client.get<MeshCentralSettings>('/meshcentral/settings')
  return data
}

export const saveMeshSettings = async (body: { url: string; username: string; password: string }) => {
  const { data } = await client.put<MeshCentralSettings>('/meshcentral/settings', body)
  return data
}

export const testMeshConnection = async () => {
  const { data } = await client.post<{ success: boolean; mesh_count: number; node_count: number; error: string | null }>('/meshcentral/test')
  return data
}

export const triggerMeshSync = async () => {
  const { data } = await client.post<MeshSyncResult>('/meshcentral/sync')
  return data
}

export const getMeshRemoteUrls = async (configId: string) => {
  const { data } = await client.get<MeshRemoteUrls>(`/meshcentral/remote-url/${configId}`)
  return data
}
