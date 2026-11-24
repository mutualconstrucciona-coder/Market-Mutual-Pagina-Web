import 'server-only'
import { cookies } from 'next/headers'
import { CatalogError } from '@/lib/admin/catalog-rules'
import {
  publishableApiHeaders,
  resolveSupabaseApiKeys,
  serviceApiHeaders,
  userApiHeaders,
} from '@/lib/supabase/api-keys'

const apiKeys = () => resolveSupabaseApiKeys(process.env)

export const supabaseConfigured = () =>
  apiKeys().configured

export const baseUrl = () => {
  const url = process.env.SUPABASE_URL
  let parsed: URL
  try { parsed = new URL(url ?? '') } catch { throw new Error('SUPABASE_URL inválida o ausente') }
  // Keep the project pinned without embedding the complete environment value in source.
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'qwbiemtonvzucatlvuri.supabase.co' || parsed.pathname !== '/' || parsed.search || parsed.hash)
    throw new Error('SUPABASE_URL no corresponde al proyecto Market Mutual')
  return url
}
export const publishableKey = () => {
  const key = apiKeys().publishableKey
  if (!key) throw new Error('Falta la clave pública de Supabase')
  return key
}
const serviceKey = () => {
  const key = apiKeys().secretKey
  if (!key) throw new Error('Falta la clave privada de Supabase')
  return key
}
export async function supabaseService(path: string, init: RequestInit = {}) {
  const key = serviceKey()
  const headers = new Headers(init.headers)
  for (const [name, value] of Object.entries(serviceApiHeaders(key)))
    headers.set(name, value)
  if (init.body && !headers.has('content-type')) headers.set('Content-Type', 'application/json')
  return fetch(baseUrl() + path, { ...init, headers, cache: 'no-store' })
}
export function assertSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  const host = request.headers.get('host')
  if (!origin || !host || new URL(origin).host !== host ||
      !['http:', 'https:'].includes(new URL(origin).protocol) ||
      request.headers.get('sec-fetch-site') === 'cross-site') {
    throw new CatalogError('Origen de solicitud no autorizado', 403)
  }
}
export async function currentMarketAdmin(): Promise<string | null> {
  if (!supabaseConfigured()) return null
  const token = (await cookies()).get('market_admin_access')?.value
  if (!token) return null
  const response = await fetch(baseUrl() + '/auth/v1/user', {
    headers: userApiHeaders(publishableKey(), token),
    cache: 'no-store',
  })
  if (!response.ok) return null
  const user = await response.json() as { id?: string }
  if (!user.id || !/^[a-f0-9-]{36}$/.test(user.id)) return null
  const role = await supabaseService('/rest/v1/market_admin_users?select=user_id&user_id=eq.' + user.id + '&limit=1')
  if (!role.ok) return null
  const admins = await role.json() as { user_id: string }[]
  return admins.length ? user.id : null
}
export async function requireMarketAdmin() {
  const userId = await currentMarketAdmin()
  if (!userId) throw new CatalogError('Iniciá sesión con una cuenta autorizada.', 401)
  return userId
}

export { publishableApiHeaders }
