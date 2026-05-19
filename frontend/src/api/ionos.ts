import client from './client'
import type {
  IonosSettings,
  IonosTestResult,
  IonosDomainsResponse,
} from '@/types'

export const getIonosSettings = async () => {
  const { data } = await client.get<IonosSettings>('/ionos/settings')
  return data
}

export const saveIonosSettings = async (body: { prefix: string; secret: string }) => {
  const { data } = await client.put<IonosSettings>('/ionos/settings', body)
  return data
}

export const testIonosConnection = async () => {
  const { data } = await client.post<IonosTestResult>('/ionos/test')
  return data
}

export const getIonosDomains = async (force = false) => {
  const { data } = await client.get<IonosDomainsResponse>('/ionos/domains', {
    params: force ? { force: true } : undefined,
  })
  return data
}
