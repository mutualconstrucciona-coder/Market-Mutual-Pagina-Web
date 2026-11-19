import { catalogRepository } from '@/lib/admin/catalog-repository'
import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { CatalogError } from '@/lib/admin/catalog-rules'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request: Request) {
  try {
    await requireAdmin(request)
    return Response.json(await catalogRepository().read(), {
      headers: { 'Cache-Control': 'no-store' },
    })
  } catch (error) {
    return errorResponse(error)
  }
}
export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const text = await request.text()
    if (text.length > 1000000)
      throw new CatalogError('La solicitud es demasiado grande.', 413)
    let payload
    try {
      payload = JSON.parse(text)
    } catch {
      throw new CatalogError(
        'La solicitud está incompleta. Volvé a intentarlo.',
      )
    }
    return Response.json(
      await catalogRepository().mutate(
        payload.revision,
        payload.command,
        actor,
      ),
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
