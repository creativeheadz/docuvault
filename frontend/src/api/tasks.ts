import client from './client'
import type { Task } from '@/types'

export interface ListTasksParams {
  organization_id?: string
  parent_id?: string
  root_only?: boolean
  status?: string
  include_archived?: boolean
}

export const getTasks = async (params?: ListTasksParams) => {
  const { data } = await client.get<Task[]>('/tasks', { params })
  return data
}

export const getTask = async (id: string) => {
  const { data } = await client.get<Task>(`/tasks/${id}`)
  return data
}

export const createTask = async (body: Partial<Task>) => {
  const { data } = await client.post<Task>('/tasks', body)
  return data
}

export const updateTask = async (id: string, body: Partial<Task>) => {
  const { data } = await client.put<Task>(`/tasks/${id}`, body)
  return data
}

export const deleteTask = async (id: string) => {
  await client.delete(`/tasks/${id}`)
}
