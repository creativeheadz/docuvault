import client from './client'
import type { Document, DocumentFolder, DocumentVersion, DocumentTemplate } from '@/types'

export const getDocuments = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<Document[]>('/documents', { params })
  return data
}

export const getDocument = async (id: string) => {
  const { data } = await client.get<Document>(`/documents/${id}`)
  return data
}

export const createDocument = async (body: Record<string, unknown>) => {
  const { data } = await client.post<Document>('/documents', body)
  return data
}

export const updateDocument = async (id: string, body: Record<string, unknown>) => {
  const { data } = await client.put<Document>(`/documents/${id}`, body)
  return data
}

export const deleteDocument = async (id: string) => {
  await client.delete(`/documents/${id}`)
}

export const getDocumentVersions = async (id: string) => {
  const { data } = await client.get<DocumentVersion[]>(`/documents/${id}/versions`)
  return data
}

export const getDocumentFolders = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<DocumentFolder[]>('/documents/folders', { params })
  return data
}

export const createDocumentFolder = async (body: Record<string, unknown>) => {
  const { data } = await client.post<DocumentFolder>('/documents/folders', body)
  return data
}

export const deleteDocumentFolder = async (id: string) => {
  await client.delete(`/documents/folders/${id}`)
}

export const getDocumentTemplates = async () => {
  const { data } = await client.get<DocumentTemplate[]>('/documents/templates')
  return data
}

export const createDocumentTemplate = async (body: Record<string, unknown>) => {
  const { data } = await client.post<DocumentTemplate>('/documents/templates', body)
  return data
}
