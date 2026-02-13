import client from './client'
import type { Contact } from '@/types'

export const getContacts = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Contact[]>('/contacts', { params })
  return data
}

export const getContact = async (id: string) => {
  const { data } = await client.get<Contact>(`/contacts/${id}`)
  return data
}

export const createContact = async (body: Partial<Contact>) => {
  const { data } = await client.post<Contact>('/contacts', body)
  return data
}

export const updateContact = async (id: string, body: Partial<Contact>) => {
  const { data } = await client.put<Contact>(`/contacts/${id}`, body)
  return data
}

export const deleteContact = async (id: string) => {
  await client.delete(`/contacts/${id}`)
}
