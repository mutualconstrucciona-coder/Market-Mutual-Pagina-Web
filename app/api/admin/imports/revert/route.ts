import { CatalogError } from '@/lib/admin/catalog-rules'
import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { readImportJson } from '@/lib/admin/import-http'
import { listImportHistory, revertCatalogImport } from '@/lib/admin/import-repository'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const actor = await requireAdmin(request)
    const payload = await readImportJson(request)
    if (typeof payload.importId !== 'string' || !Number.isSafeInteger(payload.expectedRevision))
      throw new CatalogError('La solicitud de reversión no es válida.', 422)
    const snapshot = await revertCatalogImport(payload.importId, Number(payload.expectedRevision), actor)
    return Response.json(
      { snapshot, history: await listImportHistory() },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
