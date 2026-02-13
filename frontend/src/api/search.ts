import client from './client'

export interface SearchResult {
  entity_type: string
  entity_id: string
  name: string
}

export interface SearchResponse {
  results: SearchResult[]
  total: number
}

export const globalSearch = async (query: string) => {
  const { data } = await client.get<SearchResponse>('/search', { params: { q: query } })
  return data
}
