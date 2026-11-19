import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { baseUrl, supabaseConfigured } from '@/lib/supabase/server'
import {
  developmentDataDir,
  localAdminEnabled,
} from '@/lib/admin/catalog-repository'
export const runtime = 'nodejs'
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { name } = await params
  if (!localAdminEnabled() || !/^[a-f0-9-]{36}\.webp$/.test(name))
    return new Response(null, { status: 404 })
  try {
    return new Response(
      await readFile(path.join(developmentDataDir(), 'uploads', name)),
      {
        headers: {
          'Content-Type': 'image/webp',
          'Cache-Control': 'public,max-age=31536000,immutable',
          'X-Content-Type-Options': 'nosniff',
        },
      },
    )
  } catch {
    return new Response(null, { status: 404 })
  }
}
