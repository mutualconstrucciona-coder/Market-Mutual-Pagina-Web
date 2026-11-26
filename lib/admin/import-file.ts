import readExcelFile from 'read-excel-file/universal'
import type { ImportCell } from '@/lib/admin/import-rules'
import { IMPORT_FILE_SIZE_ERROR, MAX_IMPORT_COLUMNS, MAX_IMPORT_FILE_SIZE, MAX_IMPORT_ROWS } from './import-limits'

export type ParsedImportFile = {
  fileName: string
  fileHash: string
  fileSize: number
  sheets: { name: string; rows: ImportCell[][]; rowCount: number; columnCount: number }[]
}
function decodeCsv(buffer: ArrayBuffer) {
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
  let start = 0
  const tokens = new RegExp(`["\\r\\n${delimiter}]`, 'g')
  const addCell = (end: number) => {
    if (row.length >= MAX_IMPORT_COLUMNS)
      throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_COLUMNS} columnas.`)
    row.push(cell + text.slice(start, end))
    cell = ''
  }
  const addRow = (end: number) => {
    if (rows.length >= MAX_IMPORT_ROWS)
      throw new Error(`El archivo supera el máximo de ${MAX_IMPORT_ROWS.toLocaleString('es-AR')} filas.`)
    addCell(end)
    rows.push(row)
    row = []
  }
  for (let token = tokens.exec(text); token; token = tokens.exec(text)) {
    const [char] = token
    const index = token.index
    if (char === '"') {
      cell += text.slice(start, index)
      if (quoted && text[index + 1] === '"') {
        cell += '"'
        tokens.lastIndex += 1
      } else quoted = !quoted
      start = tokens.lastIndex
    } else if (char === delimiter && !quoted) {
      addCell(index)
      start = tokens.lastIndex
    } else if ((char === '\n' || char === '\r') && !quoted) {
      addRow(index)
      if (char === '\r' && text[index + 1] === '\n') tokens.lastIndex += 1
      start = tokens.lastIndex
    }
  }
  if (quoted) throw new Error('El CSV contiene una celda con comillas sin cerrar.')
  if (cell || row.length || start < text.length) addRow(text.length)
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

function validateWorkbookArchive(buffer: ArrayBuffer) {
  const view = new DataView(buffer)
  const invalid = () => new Error('El archivo Excel está dañado o usa un formato ZIP no compatible.')
  // An XLSX is a ZIP archive. Bound its expanded size before invoking the parser.
  let end = view.byteLength - 22
  for (; end >= Math.max(0, view.byteLength - 65_557); end--) {
    if (view.getUint32(end, true) === 0x06054b50 && end + 22 + view.getUint16(end + 20, true) === view.byteLength) break
  }
  if (end < Math.max(0, view.byteLength - 65_557)) throw invalid()
  const entries = view.getUint16(end + 10, true)
  let offset = view.getUint32(end + 16, true)
  let expandedBytes = 0
  if (entries > 512 || offset + view.getUint32(end + 12, true) !== end) throw invalid()
  for (let index = 0; index < entries; index++) {
    if (offset + 46 > end || view.getUint32(offset, true) !== 0x02014b50) throw invalid()
    expandedBytes += view.getUint32(offset + 24, true)
    if (expandedBytes > 48 * 1024 * 1024)
      throw new Error('El Excel supera los 48 MB al descomprimirse. Exportá solo la hoja necesaria o guardala como CSV.')
    offset += 46 + view.getUint16(offset + 28, true) + view.getUint16(offset + 30, true) + view.getUint16(offset + 32, true)
  }
  if (offset !== end) throw invalid()
}

export async function parseImportFile(file: File): Promise<ParsedImportFile> {
  if (!file.name || file.name.length > 180) throw new Error('El nombre del archivo no es válido.')
  if (file.size <= 0) throw new Error('El archivo está vacío.')
  if (file.size > MAX_IMPORT_FILE_SIZE) throw new Error(IMPORT_FILE_SIZE_ERROR)
  const extension = file.name.split('.').at(-1)?.toLowerCase()
  if (!['xlsx', 'xls', 'csv'].includes(extension ?? ''))
    throw new Error('Usá un archivo .xlsx, .xls compatible o .csv.')
  const buffer = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buffer)
  const fileHash = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  let sheets: { name: string; rows: ImportCell[][] }[]
  if (extension === 'csv') {
    sheets = [{ name: 'CSV', rows: parseCsv(decodeCsv(buffer)) }]
  } else {
    const signature = new Uint8Array(buffer, 0, Math.min(2, buffer.byteLength))
    const isZip = signature[0] === 0x50 && signature[1] === 0x4b
    if (!isZip)
      throw new Error(
        'Este archivo .xls usa el formato binario antiguo. Exportalo desde Posberry como .xlsx o .csv.',
      )
    validateWorkbookArchive(buffer)
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
