import client from './client'
import type { DnsLookupResult } from '@/types'

export const dnsLookup = async (hostname: string) => {
  const { data } = await client.get<DnsLookupResult>('/dns/lookup', { params: { hostname } })
  return data
}
