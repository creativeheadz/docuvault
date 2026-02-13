import client from './client'
import type { Password, PasswordCategory } from '@/types'

export const getPasswords = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Password[]>('/passwords', { params })
  return data
}

export const getPassword = async (id: string) => {
  const { data } = await client.get<Password>(`/passwords/${id}`)
  return data
}

export const createPassword = async (body: Record<string, unknown>) => {
  const { data } = await client.post<Password>('/passwords', body)
  return data
}

export const updatePassword = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<Password>(`/passwords/${id}`, body)
  return data
}

export const deletePassword = async (id: string) => {
  await client.delete(`/passwords/${id}`)
}

export const revealPassword = async (id: string) => {
  const { data } = await client.post<{ password: string }>(`/passwords/${id}/reveal`)
  return data.password
}

export const getPasswordAudit = async (id: string) => {
  const { data } = await client.get(`/passwords/${id}/audit`)
  return data
}

export const getPasswordCategories = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<PasswordCategory[]>('/passwords/categories', { params })
  return data
}

export const createPasswordCategory = async (body: Partial<PasswordCategory>) => {
  const { data } = await client.post<PasswordCategory>('/passwords/categories', body)
  return data
}

export const deletePasswordCategory = async (id: string) => {
  await client.delete(`/passwords/categories/${id}`)
}
