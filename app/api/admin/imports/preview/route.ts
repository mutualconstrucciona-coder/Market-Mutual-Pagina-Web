import { catalogRepository } from '@/lib/admin/catalog-repository'
import { CatalogError } from '@/lib/admin/catalog-rules'
import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { readImportJson, validateImportSource } from '@/lib/admin/import-http'
import { buildImportPreview } from '@/lib/admin/import-rules'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const payload = await readImportJson(request)
    const source = validateImportSource(payload.source)
    const snapshot = await catalogRepository().read()
    try {
      return Response.json(buildImportPreview(snapshot.products, snapshot.revision, source), {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      throw new CatalogError(error instanceof Error ? error.message : 'No se pudo generar la vista previa.', 422)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
