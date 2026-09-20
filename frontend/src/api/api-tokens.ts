import client from './client'
import type { ApiToken, ApiTokenCreated } from '@/types'

export async function getApiTokens(): Promise<ApiToken[]> {
  const { data } = await client.get<ApiToken[]>('/api-tokens')
  return data
}

/**
 * Mint a key. The plaintext token is in the response to this call and
 * nowhere else — the server stores only a SHA-256 — so whatever calls this
 * must show it to the person before the response is discarded.
 */
export async function createApiToken(body: {
  name: string
  description?: string | null
  organization_ids?: string[]
  expires_in_days?: number | null
}): Promise<ApiTokenCreated> {
  const { data } = await client.post<ApiTokenCreated>('/api-tokens', body)
  return data
}

export async function revokeApiToken(id: string): Promise<ApiToken> {
  const { data } = await client.post<ApiToken>(`/api-tokens/${id}/revoke`)
  return data
}
