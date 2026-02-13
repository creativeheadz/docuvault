import client from './client'
import type { SSLCertificate } from '@/types'

export const getSSLCertificates = async (params?: Record<string, unknown>) => {
  const { data } = await client.get<SSLCertificate[]>('/ssl-certificates', { params })
  return data
}

export const getSSLCertificate = async (id: string) => {
  const { data } = await client.get<SSLCertificate>(`/ssl-certificates/${id}`)
  return data
}

export const createSSLCertificate = async (body: Partial<SSLCertificate>) => {
  const { data } = await client.post<SSLCertificate>('/ssl-certificates', body)
  return data
}

export const updateSSLCertificate = async (id: string, body: Partial<SSLCertificate>) => {
  const { data } = await client.put<SSLCertificate>(`/ssl-certificates/${id}`, body)
  return data
}

export const deleteSSLCertificate = async (id: string) => {
  await client.delete(`/ssl-certificates/${id}`)
}
