import 'server-only'
import { CatalogError } from '@/lib/admin/catalog-rules'
import {
  MAX_IMPORT_COLUMNS,
  MAX_IMPORT_FILE_SIZE,
  MAX_IMPORT_ROWS,
} from '@/lib/admin/import-file'
import type { ImportCell, ImportSource } from '@/lib/admin/import-rules'

const MAX_IMPORT_REQUEST_SIZE = 8 * 1024 * 1024

export async function readImportJson(request: Request) {
  const text = await request.text()
  if (text.length > MAX_IMPORT_REQUEST_SIZE)
    throw new CatalogError('La importación supera el límite permitido.', 413)
  try {
    return JSON.parse(text) as Record<string, unknown>
  } catch {
    throw new CatalogError('La solicitud de importación no es válida.', 400)
  }
}
export function validateImportSource(value: unknown): ImportSource {
  if (!value || typeof value !== 'object') throw new CatalogError('Faltan los datos del archivo.', 422)
  const source = value as Partial<ImportSource>
  if (!['stock', 'price'].includes(source.kind ?? ''))
    throw new CatalogError('Elegí si querés actualizar stock o precios.', 422)
  if (
    typeof source.fileName !== 'string' ||
    source.fileName.length < 1 ||
    source.fileName.length > 180 ||
    typeof source.fileHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(source.fileHash) ||
    !Number.isSafeInteger(source.fileSize) ||
    Number(source.fileSize) < 1 ||
    Number(source.fileSize) > MAX_IMPORT_FILE_SIZE ||
    typeof source.sheetName !== 'string' ||
    source.sheetName.length < 1 ||
    source.sheetName.length > 180
  )
    throw new CatalogError('Los datos del archivo no son válidos.', 422)
  if (!Array.isArray(source.rows) || source.rows.length > MAX_IMPORT_ROWS)
    throw new CatalogError('La hoja supera el límite de filas.', 422)
  const rows = source.rows.map((row) => {
    if (!Array.isArray(row) || row.length > MAX_IMPORT_COLUMNS)
      throw new CatalogError('La hoja contiene una fila inválida o demasiadas columnas.', 422)
    return row.map((cell) => {
      if (cell === null || ['string', 'number', 'boolean'].includes(typeof cell)) return cell as ImportCell
      throw new CatalogError('La hoja contiene un valor no compatible.', 422)
    })
  })
  if (!source.mapping || typeof source.mapping !== 'object')
    throw new CatalogError('Completá el mapeo de columnas.', 422)
  for (const index of [source.mapping.sku, source.mapping.ean, source.mapping.name, source.mapping.value]) {
    if (index !== undefined && (!Number.isInteger(index) || index < 0 || index >= MAX_IMPORT_COLUMNS))
      throw new CatalogError('El mapeo de columnas no es válido.', 422)
  }
  if (!Number.isInteger(source.headerRow) || Number(source.headerRow) < 0)
    throw new CatalogError('La fila de encabezados no es válida.', 422)
  return { ...source, rows } as ImportSource
}
