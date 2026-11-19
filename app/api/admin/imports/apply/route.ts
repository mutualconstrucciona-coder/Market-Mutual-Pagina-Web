import { catalogRepository } from '@/lib/admin/catalog-repository'
import { CatalogError } from '@/lib/admin/catalog-rules'
import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { readImportJson, validateImportSource } from '@/lib/admin/import-http'
import { buildImportPreview } from '@/lib/admin/import-rules'
import { applyCatalogImport, listImportHistory } from '@/lib/admin/import-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const payload = await readImportJson(request)
    const source = validateImportSource(payload.source)
    if (!Number.isSafeInteger(payload.expectedRevision) || Number(payload.expectedRevision) < 0)
      throw new CatalogError('La revisión del catálogo no es válida.', 422)
    const snapshot = await catalogRepository().read()
    if (snapshot.revision !== payload.expectedRevision)
      throw new CatalogError('El catálogo cambió desde la vista previa. Volvé a revisar el archivo.', 409)
    let preview
    try {
      preview = buildImportPreview(snapshot.products, snapshot.revision, source)
    } catch (error) {
      throw new CatalogError(error instanceof Error ? error.message : 'No se pudo validar la importación.', 422)
    }
    const next = await applyCatalogImport(source, preview, Number(payload.expectedRevision), actor)
    return Response.json(
      { snapshot: next, history: await listImportHistory() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
