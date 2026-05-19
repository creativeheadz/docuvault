import client from './client'
import type {
  RegistrarProviderStatus,
  RegistrarTestResult,
  RegistrarDomainsResponse,
  DnsRecord,
  DnsRecordInput,
} from '@/types'

export const getRegistrarProviders = async () => {
  const { data } = await client.get<RegistrarProviderStatus[]>('/registrars/providers')
  return data
}

export const saveRegistrarSettings = async (
  providerKey: string,
  values: Record<string, string>,
) => {
  const { data } = await client.put<{ key: string; label: string; configured: boolean }>(
    `/registrars/${providerKey}/settings`,
    { values },
  )
  return data
}

export const testRegistrar = async (providerKey: string) => {
  const { data } = await client.post<RegistrarTestResult>(
    `/registrars/${providerKey}/test`,
  )
  return data
}

export const getRegistrarDomains = async (force = false) => {
  const { data } = await client.get<RegistrarDomainsResponse>('/registrars/domains', {
    params: force ? { force: true } : undefined,
  })
  return data
}

export const getDnsRecords = async (provider: string, domain: string) => {
  const { data } = await client.get<{ domain: string; records: DnsRecord[] }>(
    `/registrars/${provider}/dns`,
    { params: { domain } },
  )
  return data
}

export const createDnsRecord = async (
  provider: string,
  domain: string,
  record: DnsRecordInput,
) => {
  const { data } = await client.post(`/registrars/${provider}/dns`, record, {
    params: { domain },
  })
  return data
}

export const updateDnsRecord = async (
  provider: string,
  domain: string,
  recordId: string,
  record: DnsRecordInput,
) => {
  const { data } = await client.put(
    `/registrars/${provider}/dns/${recordId}`,
    record,
    { params: { domain } },
  )
  return data
}

export const deleteDnsRecord = async (
  provider: string,
  domain: string,
  recordId: string,
) => {
  const { data } = await client.delete(
    `/registrars/${provider}/dns/${recordId}`,
    { params: { domain } },
  )
  return data
}
