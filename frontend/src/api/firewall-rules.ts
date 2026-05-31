import client from './client'
import type { FirewallRule, FirewallRuleStats } from '@/types'

export interface ListFirewallRulesParams {
  organization_id?: string
  status?: string
  include_archived?: boolean
  overdue_only?: boolean
}

export const getFirewallRules = async (params?: ListFirewallRulesParams) => {
  const { data } = await client.get<FirewallRule[]>('/firewall-rules', { params })
  return data
}

export const getFirewallRule = async (id: string) => {
  const { data } = await client.get<FirewallRule>(`/firewall-rules/${id}`)
  return data
}

export const createFirewallRule = async (body: Partial<FirewallRule>) => {
  const { data } = await client.post<FirewallRule>('/firewall-rules', body)
  return data
}

export const updateFirewallRule = async (id: string, body: Partial<FirewallRule>) => {
  const { data } = await client.put<FirewallRule>(`/firewall-rules/${id}`, body)
  return data
}

export const deleteFirewallRule = async (id: string) => {
  await client.delete(`/firewall-rules/${id}`)
}

export const reviewFirewallRule = async (
  id: string,
  body: { reviewed_on?: string; extend_months?: number; notes?: string },
) => {
  const { data } = await client.post<FirewallRule>(`/firewall-rules/${id}/review`, body)
  return data
}

export const getFirewallRulesStats = async () => {
  const { data } = await client.get<FirewallRuleStats>('/firewall-rules/stats')
  return data
}

export const exportFirewallRulesCsvUrl = () => '/api/v1/firewall-rules/export.csv'
