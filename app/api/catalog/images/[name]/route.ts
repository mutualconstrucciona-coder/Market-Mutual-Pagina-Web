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
  if (!/^[a-f0-9-]{36}\.webp$/.test(name))
    return new Response(null, { status: 404 })

  if (supabaseConfigured()) {
    const response = await fetch(
      `${baseUrl()}/storage/v1/object/public/market-product-images/${name}`,
      { cache: 'force-cache' },
    )
    if (!response.ok) return new Response(null, { status: 404 })
    return new Response(response.body, {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'public,max-age=31536000,immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  }

  if (!localAdminEnabled()) return new Response(null, { status: 404 })

  try {
    const [{ readFile }, { default: path }] = await Promise.all([
      import('node:fs/promises'),
      import('node:path'),
    ])
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
