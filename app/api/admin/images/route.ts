import { randomUUID } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { requireAdmin, errorResponse } from '@/lib/admin/http'
import { developmentDataDir } from '@/lib/admin/catalog-repository'
import { CatalogError } from '@/lib/admin/catalog-rules'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    await requireAdmin(request)
    if (Number(request.headers.get('content-length')) > 6 * 1024 * 1024)
      throw new CatalogError('La imagen debe pesar menos de 5 MB.', 413)
    const form = await request.formData()
    const file = form.get('image')
    if (!(file instanceof File) || file.size > 5 * 1024 * 1024)
      throw new CatalogError('Elegí una imagen de menos de 5 MB.', 422)
    const bytes = Buffer.from(await file.arrayBuffer())
    if (
      bytes.length < 30 ||
      bytes.toString('ascii', 0, 4) !== 'RIFF' ||
      bytes.toString('ascii', 8, 12) !== 'WEBP'
    )
      throw new CatalogError(
        'La imagen recibida no es un WebP válido. Volvé a seleccionarla.',
        422,
      )
    const name = `${randomUUID()}.webp`
    const dir = path.join(developmentDataDir(), 'uploads')
    await mkdir(dir, { recursive: true })
    await writeFile(path.join(dir, name), bytes, { flag: 'wx' })
    return Response.json(
      { imageUrl: `/api/catalog/images/${name}` },
      { status: 201 },
    )
  } catch (error) {
    return errorResponse(error)
  }
}
