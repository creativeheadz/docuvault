import client from './client'
import type { Checklist } from '@/types'

export const getChecklists = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Checklist[]>('/checklists', { params })
  return data
}

export const getChecklist = async (id: string) => {
  const { data } = await client.get<Checklist>(`/checklists/${id}`)
  return data
}

export const createChecklist = async (body: Record<string, unknown>) => {
  const { data } = await client.post<Checklist>('/checklists', body)
  return data
}

export const updateChecklist = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<Checklist>(`/checklists/${id}`, body)
  return data
}

export const deleteChecklist = async (id: string) => {
  await client.delete(`/checklists/${id}`)
}

export const createChecklistItem = async (checklistId: string, body: Record<string, unknown>) => {
  const { data } = await client.post(`/checklists/${checklistId}/items`, body)
  return data
}

export const toggleChecklistItem = async (checklistId: string, itemId: string) => {
  const { data } = await client.post(`/checklists/${checklistId}/items/${itemId}/toggle`)
  return data
}

export const deleteChecklistItem = async (checklistId: string, itemId: string) => {
  await client.delete(`/checklists/${checklistId}/items/${itemId}`)
}
