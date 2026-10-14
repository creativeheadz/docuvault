import {
  Globe, Building2, Cloud, BrickWall, Router, Network, Wifi, Server, Layers, HardDrive,
  Monitor, Laptop, Printer, Phone, Cctv, Cpu, BatteryCharging, CircleDot,
  type LucideIcon,
} from 'lucide-react'
import type { LinkKind, MapRecord, NodeKind, ZoneTone } from '@/types'

/**
 * Where a kind sits in a network, outermost first. Auto-layout orders
 * siblings by it, and the drawing gives the outside world a different shape.
 */
export type Tier = 'outside' | 'edge' | 'fabric' | 'compute' | 'endpoint'

export interface KindMeta {
  label: string
  icon: LucideIcon
  tier: Tier
  /** Functions offered first in the inspector for this kind. */
  functions: string[]
}

export const NODE_KINDS: Record<NodeKind, KindMeta> = {
  internet:        { label: 'Internet',     icon: Globe,           tier: 'outside',  functions: [] },
  isp:             { label: 'ISP',          icon: Building2,       tier: 'outside',  functions: ['Static IP', 'PPPoE', 'Leased line'] },
  cloud:           { label: 'Cloud',        icon: Cloud,           tier: 'outside',  functions: ['SaaS', 'IaaS', 'Backup', 'DNS'] },
  firewall:        { label: 'Firewall',     icon: BrickWall,       tier: 'edge',     functions: ['Gateway', 'NAT', 'DHCP', 'DNS', 'VPN', 'IDS/IPS'] },
  router:          { label: 'Router',       icon: Router,          tier: 'edge',     functions: ['Gateway', 'NAT', 'DHCP', 'DNS', 'VPN', 'Inter-VLAN'] },
  switch:          { label: 'Switch',       icon: Network,         tier: 'fabric',   functions: ['Core', 'Access', 'PoE', 'Inter-VLAN', 'Stacked'] },
  access_point:    { label: 'Access point', icon: Wifi,            tier: 'fabric',   functions: ['Staff SSID', 'Guest SSID', 'Mesh', 'PoE powered'] },
  server:          { label: 'Server',       icon: Server,          tier: 'compute',  functions: ['Hypervisor', 'AD DC', 'DNS', 'DHCP', 'File server', 'Backup', 'Web', 'Database'] },
  virtual_machine: { label: 'Virtual machine', icon: Layers,       tier: 'compute',  functions: ['AD DC', 'DNS', 'Web', 'Database', 'Monitoring', 'Mail'] },
  nas:             { label: 'NAS',          icon: HardDrive,       tier: 'compute',  functions: ['File server', 'Backup target', 'iSCSI', 'Media'] },
  workstation:     { label: 'Workstation',  icon: Monitor,         tier: 'endpoint', functions: [] },
  laptop:          { label: 'Laptop',       icon: Laptop,          tier: 'endpoint', functions: [] },
  printer:         { label: 'Printer',      icon: Printer,         tier: 'endpoint', functions: ['Scan to email', 'Scan to folder'] },
  phone:           { label: 'Phone',        icon: Phone,           tier: 'endpoint', functions: ['VoIP', 'PoE powered'] },
  camera:          { label: 'Camera',       icon: Cctv,            tier: 'endpoint', functions: ['NVR', 'PoE powered'] },
  iot:             { label: 'IoT',          icon: Cpu,             tier: 'endpoint', functions: [] },
  ups:             { label: 'UPS',          icon: BatteryCharging, tier: 'endpoint', functions: ['Network card', 'USB shutdown'] },
  other:           { label: 'Device',       icon: CircleDot,       tier: 'endpoint', functions: [] },
}

export const NODE_KIND_ORDER = Object.keys(NODE_KINDS) as NodeKind[]

export const TIER_RANK: Record<Tier, number> = { outside: 0, edge: 1, fabric: 2, compute: 3, endpoint: 4 }

/** Grouped for the kind picker and the drawing palette. */
export const KIND_GROUPS: { title: string; kinds: NodeKind[] }[] = [
  { title: 'Outside', kinds: ['internet', 'isp', 'cloud'] },
  { title: 'Edge & fabric', kinds: ['firewall', 'router', 'switch', 'access_point'] },
  { title: 'Compute', kinds: ['server', 'virtual_machine', 'nas'] },
  { title: 'Endpoints', kinds: ['workstation', 'laptop', 'printer', 'phone', 'camera', 'iot', 'ups', 'other'] },
]

export const COMMON_FUNCTIONS = [
  'Gateway', 'DHCP', 'DNS', 'NAT', 'VPN', 'PoE', 'Wi-Fi', 'AD DC', 'File server', 'Backup', 'Monitoring', 'NTP',
]

export interface LinkMeta {
  label: string
  /** One line for the picker. */
  hint: string
}

export const LINK_KINDS: Record<LinkKind, LinkMeta> = {
  ethernet: { label: 'Ethernet', hint: 'Copper patch or run' },
  fibre:    { label: 'Fibre',    hint: 'SFP / optical' },
  trunk:    { label: 'Trunk',    hint: 'Tagged VLANs, LAG' },
  wifi:     { label: 'Wi-Fi',    hint: 'Wireless association' },
  wan:      { label: 'WAN',      hint: 'Carrier / internet circuit' },
  vpn:      { label: 'VPN',      hint: 'Encrypted tunnel' },
  logical:  { label: 'Logical',  hint: 'Dependency, not a cable' },
}

export const LINK_KIND_ORDER = Object.keys(LINK_KINDS) as LinkKind[]

export const SPEEDS = ['100M', '1G', '2.5G', '10G', '25G', '40G']

export const ZONE_TONES: Record<ZoneTone, { label: string; color: string }> = {
  neutral: { label: 'Neutral', color: 'var(--ink-faint)' },
  ember:   { label: 'Ember',   color: 'var(--ember)' },
  blue:    { label: 'Blue',    color: 'var(--blue)' },
  green:   { label: 'Green',   color: 'var(--green)' },
  warn:    { label: 'Amber',   color: 'var(--warn)' },
  red:     { label: 'Red',     color: 'var(--red)' },
}

export const ZONE_TONE_ORDER = Object.keys(ZONE_TONES) as ZoneTone[]

/** Display name: the map's own label, else the record's name, else the kind. */
export function nodeName(
  data: { label: string | null; kind: NodeKind; configuration_id: string | null },
  record?: MapRecord,
): string {
  return data.label?.trim() || record?.name || NODE_KINDS[data.kind]?.label || 'Device'
}

const RULES: [NodeKind, RegExp][] = [
  ['firewall',        /firewall|pfsense|opnsense|fortigate|fortinet|sophos|watchguard|sonicwall|\budm\b|\busg\b|checkpoint/],
  ['router',          /router|mikrotik|routeros|draytek|edgerouter|\bgateway\b|cisco isr/],
  ['switch',          /switch|catalyst|procurve|\busw\b|nexus|powerconnect|netgear gs|tl-sg/],
  ['access_point',    /access ?point|\bwap\b|\buap\b|\beap\d*|\bap\b|wi-?fi|wireless|meraki mr/],
  ['ups',             /\bups\b|\bapc\b|eaton|cyberpower|smart-ups/],
  ['nas',             /\bnas\b|synology|qnap|truenas|freenas|diskstation|readynas/],
  ['virtual_machine', /\bvm\b|virtual machine|\blxc\b|container|guest/],
  ['server',          /server|proxmox|esxi|vmware|hypervisor|hyper-v|poweredge|proliant/],
  ['printer',         /printer|\bmfp\b|laserjet|officejet|brother|epson|kyocera|ricoh|xerox|\bcanon\b/],
  ['camera',          /camera|cctv|\bnvr\b|\bdvr\b|hikvision|dahua|reolink|axis/],
  ['phone',           /\bphone\b|voip|yealink|polycom|grandstream|snom|\bdect\b/],
  ['laptop',          /laptop|notebook|macbook|thinkpad|latitude|elitebook|probook|surface|chromebook/],
  ['iot',             /\biot\b|sensor|thermostat|smart|hue|zigbee|esp32|raspberry/],
  ['workstation',     /workstation|desktop|\bpc\b|optiplex|imac|thinkcentre|elitedesk|prodesk/],
]

/** Best guess at how to draw a record, from everything it says about itself. */
export function inferKind(record: MapRecord): NodeKind {
  const text = [
    record.configuration_type, record.name, record.model, record.manufacturer, record.operating_system,
  ].filter(Boolean).join(' ').toLowerCase()
  for (const [kind, re] of RULES) if (re.test(text)) return kind
  if (record.device_role === 'server') return 'server'
  if (record.device_role === 'network') return 'switch'
  if (record.device_role) return 'workstation'
  if (/windows|macos|mac os|ubuntu|linux|debian|fedora/.test(text)) return 'workstation'
  return 'other'
}

/** The medium a new connection between these two kinds most likely is. */
export function inferLinkKind(a: NodeKind, b: NodeKind): LinkKind {
  const pair = new Set([a, b])
  if (pair.has('internet') || pair.has('isp')) return 'wan'
  if (pair.has('cloud')) return 'vpn'
  const wireless: NodeKind[] = ['laptop', 'phone', 'iot']
  if (pair.has('access_point') && wireless.some((k) => pair.has(k))) return 'wifi'
  if (pair.has('ups')) return 'logical'
  if (a === 'switch' && b === 'switch') return 'trunk'
  return 'ethernet'
}
