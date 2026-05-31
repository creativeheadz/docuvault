import client from './client'
import type { UserAccess, UserAccessStats, AccessMatrix } from '@/types'

export interface ListUserAccessParams {
  contact_id?: string
  cloud_service_id?: string
  configuration_id?: string
  include_inactive?: boolean
  overdue_only?: boolean
}

export const getUserAccess = async (params?: ListUserAccessParams) => {
  const { data } = await client.get<UserAccess[]>('/user-access', { params })
  return data
}

export const getUserAccessStats = async () => {
  const { data } = await client.get<UserAccessStats>('/user-access/stats')
  return data
}

export const getAccessMatrix = async () => {
  const { data } = await client.get<AccessMatrix>('/user-access/matrix')
  return data
}

export const createUserAccess = async (body: Partial<UserAccess>) => {
  const { data } = await client.post<UserAccess>('/user-access', body)
  return data
}

export const updateUserAccess = async (id: string, body: Partial<UserAccess>) => {
  const { data } = await client.put<UserAccess>(`/user-access/${id}`, body)
  return data
}

export const reviewUserAccess = async (id: string, body: { reviewed_on?: string; notes?: string }) => {
  const { data } = await client.post<UserAccess>(`/user-access/${id}/review`, body)
  return data
}

export const deleteUserAccess = async (id: string) => {
  await client.delete(`/user-access/${id}`)
}

export const exportUserAccessCsvUrl = () => '/api/v1/user-access/export.csv'
