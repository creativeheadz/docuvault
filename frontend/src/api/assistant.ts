import client from './client'

export interface AssistantModel {
  id: string
  label: string
  input: number
  output: number
  note: string
}

export interface AssistantSettings {
  model: string
  model_from: 'settings' | 'environment'
  api_key_set: boolean
  api_key_source: 'settings' | 'environment' | null
  max_output_tokens: number
  effort: 'low' | 'medium' | 'high' | null
  models: AssistantModel[]
  efforts: string[]
  limits: { min_output: number; max_output: number }
}

export const getAssistantSettings = async () => {
  const { data } = await client.get<AssistantSettings>('/assistant/settings')
  return data
}

export const saveAssistantSettings = async (body: {
  model: string
  api_key?: string
  clear_key?: boolean
  max_output_tokens: number
  effort: string | null
}) => {
  const { data } = await client.put<AssistantSettings>('/assistant/settings', body)
  return data
}

export const testAssistant = async () => {
  const { data } = await client.post<{ ok: boolean; model: string; reply?: string; latency_ms?: number; error?: string }>('/assistant/test')
  return data
}
