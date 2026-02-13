import client from './client'
import type { Runbook } from '@/types'

export const getRunbooks = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Runbook[]>('/runbooks', { params })
  return data
}

export const getRunbook = async (id: string) => {
  const { data } = await client.get<Runbook>(`/runbooks/${id}`)
  return data
}

export const createRunbook = async (body: Record<string, unknown>) => {
  const { data } = await client.post<Runbook>('/runbooks', body)
  return data
}

export const updateRunbook = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<Runbook>(`/runbooks/${id}`, body)
  return data
}

export const deleteRunbook = async (id: string) => {
  await client.delete(`/runbooks/${id}`)
}

export const createRunbookStep = async (runbookId: string, body: Record<string, unknown>) => {
  const { data } = await client.post(`/runbooks/${runbookId}/steps`, body)
  return data
}

export const updateRunbookStep = async (runbookId: string, stepId: string, body: Record<string, unknown>) => {
  const { data } = await client.put(`/runbooks/${runbookId}/steps/${stepId}`, body)
  return data
}

export const deleteRunbookStep = async (runbookId: string, stepId: string) => {
  await client.delete(`/runbooks/${runbookId}/steps/${stepId}`)
}
