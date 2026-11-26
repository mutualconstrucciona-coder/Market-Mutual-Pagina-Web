import 'server-only'
import { CatalogError } from '@/lib/admin/catalog-rules'
import {
  IMPORT_FILE_SIZE_ERROR,
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_REQUEST_SIZE,
  MAX_IMPORT_ROWS,
} from '@/lib/admin/import-limits'
import type { ImportSource } from '@/lib/admin/import-rules'

export function boundedImportBody(request: Request, maxBytes: number, message: string): Response {
  const length = request.headers.get('content-length')
  if (length !== null && Number(length) > maxBytes) throw new CatalogError(message, 413)
  let bytes = 0
  const body = request.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength
      if (bytes > maxBytes) throw new CatalogError(message, 413)
      controller.enqueue(chunk)
    },
  }))
  return new Response(body, { headers: request.headers })
}

export async function readImportJson(request: Request) {
  const text = await boundedImportBody(request, MAX_IMPORT_REQUEST_SIZE,
    'Los datos de las columnas elegidas superan el límite de procesamiento. Reducí la hoja o quitá la columna opcional de nombres.').text()
  try {
    const parsed: unknown = JSON.parse(text)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error()
    return parsed as Record<string, unknown>
  } catch {
    throw new CatalogError('La solicitud de importación no es válida.', 400)
  }
}
export function validateImportSource(value: unknown): ImportSource {
  if (!value || typeof value !== 'object') throw new CatalogError('Faltan los datos del archivo.', 422)
  const source = value as Partial<ImportSource>
  if (!['stock', 'price'].includes(source.kind ?? ''))
    throw new CatalogError('Elegí si querés actualizar stock o precios.', 422)
  if (Number.isSafeInteger(source.fileSize) && Number(source.fileSize) > MAX_IMPORT_FILE_SIZE)
    throw new CatalogError(IMPORT_FILE_SIZE_ERROR, 413)
  if (
    typeof source.fileName !== 'string' ||
    source.fileName.length < 1 ||
    source.fileName.length > 180 ||
    typeof source.fileHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.fileHash) ||
    !Number.isSafeInteger(source.fileSize) ||
    Number(source.fileSize) < 1 ||
    typeof source.sheetName !== 'string' ||
    source.sheetName.length < 1 ||
    source.sheetName.length > 180
  )
    throw new CatalogError('Los datos del archivo no son válidos.', 422)
  if (!Array.isArray(source.rows) || source.rows.length > MAX_IMPORT_ROWS)
    throw new CatalogError('La hoja supera el límite de filas.', 422)
  for (const row of source.rows) {
    if (!Array.isArray(row) || row.length > MAX_IMPORT_COLUMNS)
      throw new CatalogError('La hoja contiene una fila inválida o demasiadas columnas.', 422)
    for (const cell of row) {
      if (cell !== null && !['string', 'number', 'boolean'].includes(typeof cell))
        throw new CatalogError('La hoja contiene un valor no compatible.', 422)
    }
  }
  if (!source.mapping || typeof source.mapping !== 'object')
    throw new CatalogError('Completá el mapeo de columnas.', 422)
  for (const index of [source.mapping.sku, source.mapping.ean, source.mapping.name, source.mapping.value]) {
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= MAX_IMPORT_COLUMNS))
      throw new CatalogError('El mapeo de columnas no es válido.', 422)
  }
  if (!Number.isInteger(source.headerRow) || Number(source.headerRow) < 0)
    throw new CatalogError('La fila de encabezados no es válida.', 422)
  return source as ImportSource
}
