import 'server-only'
import { createHash } from 'node:crypto'
import readExcelFile from 'read-excel-file/node'
import type { ImportCell } from '@/lib/admin/import-rules'

export const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024
export const MAX_IMPORT_ROWS = 20_000
export const MAX_IMPORT_COLUMNS = 100

export type ParsedImportFile = {
  fileName: string
  fileHash: string
  fileSize: number
  sheets: { name: string; rows: ImportCell[][]; rowCount: number; columnCount: number }[]
}
function decodeCsv(buffer: Buffer) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(buffer)
  } catch {
    return new TextDecoder('windows-1252').decode(buffer)
  }
}

function delimiterScore(text: string, delimiter: string) {
  let score = 0
  let quoted = false
  for (const char of text.slice(0, 20_000)) {
    if (char === '"') quoted = !quoted
    else if (!quoted && char === delimiter) score += 1
  }
  return score
}

function parseCsv(text: string): ImportCell[][] {
  const delimiter = [';', ',', '\t'].sort(
    (a, b) => delimiterScore(text, b) - delimiterScore(text, a),
  )[0]
  const rows: ImportCell[][] = []
  let row: ImportCell[] = []
  let cell = ''
  let quoted = false
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        index += 1
      } else quoted = !quoted
    } else if (char === delimiter && !quoted) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !quoted) {
      if (char === '\r' && text[index + 1] === '\n') index += 1
      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else cell += char
  }
  if (cell || row.length) {
    row.push(cell)
    rows.push(row)
  }
  return rows
}

const serializable = (value: unknown): ImportCell => {
  if (value == null) return null
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value
  return String(value)
}

function validateRows(rows: ImportCell[][]) {
  if (rows.length > MAX_IMPORT_ROWS)
    throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS.toLocaleString('es-AR')} filas.`)
  const columnCount = rows.reduce((maximum, row) => Math.max(maximum, row.length), 0)
  if (columnCount > MAX_IMPORT_COLUMNS)
    throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_COLUMNS} columnas.`)
  return columnCount
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (!file.name || file.name.length > 180) throw new Error('El nombre del archivo no es válido.')
  if (file.size <= 0) throw new Error('El archivo está vacío.')
  if (file.size > MAX_IMPORT_FILE_SIZE) throw new Error('El archivo supera el límite de 5 MB.')
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(extension ?? ''))
    throw new Error('Usá un archivo .xlsx, .xls compatible o .csv.')
  const buffer = Buffer.from(await file.arrayBuffer())
  const fileHash = createHash('sha256').update(buffer).digest('hex')
  let sheets: { name: string; rows: ImportCell[][] }[]
  if (extension === 'csv') {
    sheets = [{ name: 'CSV', rows: parseCsv(decodeCsv(buffer)) }]
  } else {
    const isZip = buffer[0] === 0x50 && buffer[1] === 0x4b
    if (!isZip)
      throw new Error(
        'Este archivo .xls usa el formato binario antiguo. Exportalo desde Posberry como .xlsx o .csv.',
      )
    try {
      const parsed = await readExcelFile(buffer)
      sheets = parsed.map((sheet) => ({
        name: sheet.sheet,
        rows: sheet.data.map((row) => row.map(serializable)),
      }))
    } catch {
      throw new Error('No se pudo leer el Excel. Verificá que no esté dañado ni protegido con contraseña.')
    }
  }
  if (!sheets.length) throw new Error('El archivo no contiene hojas para importar.')
  return {
    fileName: file.name,
    fileHash,
    fileSize: file.size,
    sheets: sheets.map((sheet) => ({
      name: sheet.name,
      rows: sheet.rows,
      rowCount: sheet.rows.length,
      columnCount: validateRows(sheet.rows),
    })),
  }
}
