import 'server-only'
import { cookies } from 'next/headers'
import { CatalogError } from '@/lib/admin/catalog-rules'

export const supabaseConfigured = () =>
  Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)

export const baseUrl = () => {
  const url = process.env.SUPABASE_URL
  if (!url || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(url))
    throw new Error('SUPABASE_URL inválida o ausente')
  return url
}
const serviceKey = () => {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!key) throw new Error('Falta la clave privada de Supabase')
  return key
}
export async function supabaseService(path: string, init: RequestInit = {}) {
  const key = serviceKey()
  const headers = new Headers(init.headers)
  headers.set('apikey', key)
  // Modern sb_secret_* keys are not JWTs and must not be sent as Bearer tokens.
  if (!key.startsWith('sb_secret_')) headers.set('Authorization', 'Bearer ' + key)
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
    headers: { apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, Authorization: 'Bearer ' + token },
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
