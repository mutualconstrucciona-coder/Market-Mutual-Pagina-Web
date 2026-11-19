import { CatalogError } from './catalog-rules'
import { localAdminEnabled } from './catalog-repository'
import { assertSameOrigin, requireMarketAdmin, supabaseConfigured } from '@/lib/supabase/server'

export async function requireAdmin(request: Request) {
  if (supabaseConfigured()) {
    if (request.method !== 'GET') assertSameOrigin(request)
    return requireMarketAdmin()
  }
  if (!localAdminEnabled())
    throw new CatalogError(
      'Falta configurar base de datos central y acceso del personal. El panel online está deshabilitado.',
      503,
    )
  const url = new URL(request.url)
  const host = request.headers.get('host') ?? ''
  let hostUrl: URL
  try {
    hostUrl = new URL(`${url.protocol}//${host}`)
  } catch {
    throw new CatalogError('El servidor local no es válido.', 403)
  }
  if (
    !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
    !['localhost', '127.0.0.1', '[::1]'].includes(hostUrl.hostname)
  )
    throw new CatalogError(
      'Las pruebas de administración solo están habilitadas en localhost.',
      403,
    )
  if (request.headers.get('sec-fetch-site') === 'cross-site')
    throw new CatalogError(
      'La solicitud debe iniciarse desde el panel local.',
      403,
    )
  if (request.method !== 'GET') {
    const origin = request.headers.get('origin')
    // Next may normalize request.url to localhost while the browser uses 127.0.0.1.
    // Compare Origin to the separately validated Host, including its port.
    if (origin !== hostUrl.origin)
      throw new CatalogError(
        'La solicitud no pertenece a este panel. Volvé a abrirlo e intentá de nuevo.',
        403,
      )
  }
  return 'local-development'
}
export function errorResponse(error: unknown) {
  if (error instanceof CatalogError)
    return Response.json(
      { error: error.message, fields: error.fields },
      { status: error.status },
    )
  console.error('Catalog administration:', error)
  return Response.json(
    {
      error:
        'No se pudo guardar o leer el catálogo. Tus cambios no se confirmaron; volvé a intentarlo.',
    },
    { status: 500 },
  )
}
