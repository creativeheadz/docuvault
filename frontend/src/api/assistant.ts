import client from './client'

export interface AssistantModel {
  id: string
  label: string
  input: number | null
  output: number | null
  note: string
}

export interface AssistantProvider {
  id: string
  label: string
  api: 'anthropic' | 'openai'
  key_env: string
  key_label: string
  key_placeholder: string
  key_help: string
  note: string
  default_model: string
  models: AssistantModel[]
}

export interface AssistantSettings {
  provider: string
  providers: AssistantProvider[]
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

export interface AssistantTestResult {
  ok: boolean
  provider: string
  model: string
  reply?: string
  latency_ms?: number
  error?: string
}

export const getAssistantSettings = async () => {
  const { data } = await client.get<AssistantSettings>('/assistant/settings')
  return data
}

export const saveAssistantSettings = async (body: {
  provider: string
  model: string
  api_key?: string
  clear_key?: boolean
  max_output_tokens: number
  effort: string | null
}) => {
  const { data } = await client.put<AssistantSettings>('/assistant/settings', body)
  return data
}

export const testAssistant = async (body: {
  provider: string
  model: string
  api_key?: string
  max_output_tokens: number
  effort: string | null
}) => {
  const { data } = await client.post<AssistantTestResult>('/assistant/test', body)
  return data
}
