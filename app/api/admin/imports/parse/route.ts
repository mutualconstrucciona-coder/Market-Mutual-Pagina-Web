import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { CatalogError } from '@/lib/admin/catalog-rules'
import { parseImportFile } from '@/lib/admin/import-file'
import { boundedImportBody } from '@/lib/admin/import-http'
import { IMPORT_FILE_SIZE_ERROR, MAX_IMPORT_FILE_SIZE } from '@/lib/admin/import-limits'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    let form: FormData
    try {
      form = await boundedImportBody(request, MAX_IMPORT_FILE_SIZE + 64 * 1024, IMPORT_FILE_SIZE_ERROR).formData()
    } catch (error) {
      if (error instanceof CatalogError) throw error
      throw new CatalogError('La carga del archivo no es válida.', 400)
    }
    const file = form.get('file')
    if (!(file instanceof File)) throw new CatalogError('Seleccioná un archivo de Posberry.', 422)
    if (file.size > MAX_IMPORT_FILE_SIZE) throw new CatalogError(IMPORT_FILE_SIZE_ERROR, 413)
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
