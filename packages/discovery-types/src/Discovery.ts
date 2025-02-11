import { z } from 'zod'
import { EthereumAddress } from './EthereumAddress'
import { Hash256 } from './Hash256'

export type StackCategory = z.infer<typeof StackCategory>
export const StackCategory = z.enum([
  'Core',
  'Gateways&Escrows',
  'Upgrades&Governance',
])

export type ContractValueType = z.infer<typeof ContractValueType>
export const ContractValueType = z.enum([
  'CODE_CHANGE',
  'L2',
  'EXTERNAL',
  'RISK_PARAMETER',
  'PERMISSION',
])

export type ContractFieldSeverity = z.infer<typeof ContractFieldSeverity>
export const ContractFieldSeverity = z.enum(['HIGH', 'MEDIUM', 'LOW'])

export interface DiscoveryOutput {
  name: string
  chain: string
  blockNumber: number
  contracts: ContractParameters[]
  eoas: EoaParameters[]
  abis: Record<string, string[]>
  configHash: Hash256
  usedTemplates: Record<string, Hash256>
}

export interface DiscoveryCustomType {
  typeCaster?: string
  arg?: Record<string, string | number>
}

export interface FieldMeta {
  description?: string
  severity?: ContractFieldSeverity
}

export type PermissionType =
  | 'guard'
  | 'challenge'
  | 'propose'
  | 'sequence'
  | 'validate'
  | 'fastconfirm'
  | 'configure'
  | 'upgrade'
  | 'act'

export interface ResolvedPermissionPath {
  address: EthereumAddress
  delay?: number
}

export interface ResolvedPermission {
  permission: PermissionType
  target: EthereumAddress
  delay?: number
  description?: string
  via?: ResolvedPermissionPath[]
}

export interface Meta {
  issuedPermissions?: ResolvedPermission[]
  receivedPermissions?: ResolvedPermission[]
  directlyReceivedPermissions?: ResolvedPermission[]
  categories?: StackCategory[]
  types?: ContractValueType[]
  description?: string
  severity?: ContractFieldSeverity
}

export type EoaParameters = {
  name?: string
  address: EthereumAddress
} & Meta

export type ContractParameters = {
  name: string
  displayName?: string
  description?: string
  derivedName?: string
  template?: string
  sourceHashes?: string[]
  unverified?: true
  sinceTimestamp?: number
  address: EthereumAddress
  proxyType?: string
  values?: Record<string, ContractValue | undefined>
  errors?: Record<string, string>
  ignoreInWatchMode?: string[]
  usedTypes?: DiscoveryCustomType[]
  fieldMeta?: Record<string, FieldMeta>
} & Meta

export type ContractValue =
  | string
  | number
  | boolean
  | ContractValue[]
  | { [key: string]: ContractValue | undefined }
