import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { CatalogError } from '@/lib/admin/catalog-rules'
import { parseImportFile } from '@/lib/admin/import-file'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    const form = await request.formData()
    const file = form.get('file')
    if (!(file instanceof File)) throw new CatalogError('Seleccioná un archivo de Posberry.', 422)
    try {
      return Response.json(await parseImportFile(file), {
        headers: { 'Cache-Control': 'no-store' },
      })
    } catch (error) {
      throw new CatalogError(error instanceof Error ? error.message : 'No se pudo leer el archivo.', 422)
    }
  } catch (error) {
    return errorResponse(error)
  }
}
