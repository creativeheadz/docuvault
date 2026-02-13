import client from './client'
import type { LoginResponse, TokenResponse, User, TotpSetupResponse, TotpStatusResponse } from '@/types'

export async function login(username: string, password: string): Promise<LoginResponse> {
  const { data } = await client.post<LoginResponse>('/auth/login', { username, password })
  return data
}

export async function verifyMfa(mfa_token: string, totp_code: string): Promise<TokenResponse> {
  const { data } = await client.post<TokenResponse>('/auth/mfa-verify', { mfa_token, totp_code })
  return data
}

export async function getMe(): Promise<User> {
  const { data } = await client.get<User>('/auth/me')
  return data
}

export async function logout(): Promise<void> {
  await client.post('/auth/logout')
}

export async function getMfaStatus(): Promise<TotpStatusResponse> {
  const { data } = await client.get<TotpStatusResponse>('/mfa/status')
  return data
}

export async function setupMfa(): Promise<TotpSetupResponse> {
  const { data } = await client.post<TotpSetupResponse>('/mfa/setup')
  return data
}

export async function enableMfa(totp_code: string): Promise<void> {
  await client.post('/mfa/enable', { totp_code })
}

export async function disableMfa(totp_code: string): Promise<void> {
  await client.post('/mfa/disable', { totp_code })
}
