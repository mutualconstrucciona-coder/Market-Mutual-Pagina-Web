type SupabaseApiKeyEnv = Readonly<Record<string, string | undefined>>

const present = (value?: string) => value?.trim() || undefined

export function resolveSupabaseApiKeys(env: SupabaseApiKeyEnv) {
  const url = present(env.SUPABASE_URL)
  const publishableKey = present(env.SUPABASE_PUBLISHABLE_KEY)
    ?? present(env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  const secretKey = present(env.SUPABASE_SECRET_KEY)
    ?? present(env.SUPABASE_SERVICE_ROLE_KEY)

  return {
    url,
    publishableKey,
    secretKey,
    configured: Boolean(url && publishableKey && secretKey),
  }
}

export function isLegacyJwtApiKey(key: string) {
  return key.startsWith('eyJ') && key.split('.').length === 3
}

export function publishableApiHeaders(key: string) {
  return { apikey: key }
}

export function serviceApiHeaders(key: string) {
  return {
    apikey: key,
    ...(isLegacyJwtApiKey(key)
      ? { Authorization: `Bearer ${key}` }
      : {}),
  }
}

export function userApiHeaders(key: string, accessToken: string) {
  return {
    apikey: key,
    Authorization: `Bearer ${accessToken}`,
  }
}
