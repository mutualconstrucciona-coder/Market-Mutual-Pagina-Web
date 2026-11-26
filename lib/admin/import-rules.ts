import type { Product } from '@/lib/market-data'
import { hasOnlineStock } from '@/lib/inventory'

export type ImportKind = 'stock' | 'price'
export type MissingStockPolicy = 'keep' | 'zero'
export type ImportCell = string | number | boolean | null
export type ImportColumnMapping = {
  sku?: number
  ean?: number
  value: number
  name?: number
}
export type ImportSource = {
  kind: ImportKind
  fileName: string
  fileHash: string
  fileSize: number
  sheetName: string
  rows: ImportCell[][]
  headerRow: number
  mapping: ImportColumnMapping
  missingStockPolicy?: MissingStockPolicy
  completeInventoryConfirmed?: boolean
}
export type ImportChange = {
  productId: string
  sku: string
  ean: string
  name: string
  field: ImportKind
  before: number
  after: number
}
export type ImportPreviewRow = {
  rowNumber: number | null
  productId?: string
  product: string
  code: string
  ean: string
  before?: number
  after?: number
  status:
    | 'change'
    | 'unchanged'
    | 'unmatched'
    | 'invalid'
    | 'duplicate'
    | 'ambiguous'
    | 'missing-zero'
  message: string
  onlineBefore?: boolean
  onlineAfter?: boolean
}
export type ImportPreview = {
  kind: ImportKind
  baseRevision: number
  sourceRows: number
  analyzed: number
  matched: number
  modified: number
  unchanged: number
  unmatched: number
  duplicates: number
  ambiguous: number
  invalid: number
  skipped: number
  missingProducts: number
  hiddenByThreshold: number
  republishedByThreshold: number
  criticalErrors: number
  rows: ImportPreviewRow[]
  changes: ImportChange[]
}

const normalizeHeader = (value: unknown) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()

const normalizeCode = (value: unknown) => {
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || !Number.isInteger(value)) return ''
    return String(value)
  }
  return String(value ?? '').trim()
}

const normalizeSku = (value: unknown) => normalizeCode(value).toUpperCase()
const normalizeEan = (value: unknown) => normalizeCode(value).replace(/\s+/g, '')

const headerAliases = {
  sku: [
    'sku',
    'codigo',
    'codigo interno',
    'cod interno',
    'codigo producto',
    'codigo articulo',
    'id producto',
  ],
  ean: ['ean', 'gtin', 'barcode', 'codigo de barras', 'cod barras'],
  stock: ['stock', 'existencia', 'existencias', 'cantidad', 'saldo', 'inventario'],
  price: [
    'precio',
    'precio venta',
    'precio de venta',
    'precio lista',
    'lista de precios',
    'pvp',
  ],
  name: ['producto', 'descripcion', 'nombre', 'articulo'],
} as const

export function suggestImportMapping(rows: ImportCell[][], kind: ImportKind) {
  let best: { row: number; score: number; mapping: Partial<ImportColumnMapping> } = {
    row: 0,
    score: -1,
    mapping: {},
  }
  rows.slice(0, 30).forEach((row, rowIndex) => {
    const mapping: Partial<ImportColumnMapping> = {}
    row.forEach((cell, columnIndex) => {
      const header = normalizeHeader(cell)
      if (!header) return
      for (const field of ['sku', 'ean', 'name'] as const) {
        if (mapping[field] === undefined && headerAliases[field].includes(header as never))
          mapping[field] = columnIndex
      }
      const valueAliases = kind === 'stock' ? headerAliases.stock : headerAliases.price
      if (mapping.value === undefined && valueAliases.includes(header as never))
        mapping.value = columnIndex
    })
    const score =
      (mapping.value !== undefined ? 4 : 0) +
      (mapping.sku !== undefined ? 3 : 0) +
      (mapping.ean !== undefined ? 2 : 0) +
      (mapping.name !== undefined ? 1 : 0)
    if (score > best.score) best = { row: rowIndex, score, mapping }
  })
  return best
}

export function parseArgentineNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : NaN
  let text = String(value ?? '')
    .trim()
    .replace(/^\$\s*/, '')
    .replace(/[\s\u00a0]/g, '')
  if (!text) return NaN
  if (/^-?\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(text))
    text = text.replace(/\./g, '').replace(',', '.')
  else if (/^-?\d+(?:,\d+)?$/.test(text)) text = text.replace(',', '.')
  else if (!/^-?\d+(?:\.\d+)?$/.test(text)) return NaN
  return Number(text)
}

const addIndex = (map: Map<string, Product[]>, key: string, product: Product) => {
  if (!key) return
  const current = map.get(key) ?? []
  current.push(product)
  map.set(key, current)
}

const isEmptyRow = (row: ImportCell[]) =>
  row.every((cell) => String(cell ?? '').trim() === '')

const isTotalRow = (row: ImportCell[]) =>
  row.some((cell) => /^(total|totales|subtotal)$/i.test(String(cell ?? '').trim()))

export function compactImportSource(source: ImportSource): ImportSource {
  const { sku, ean, name, value } = source.mapping
  const at = (row: ImportCell[], index?: number) => index === undefined ? null : row[index] ?? null
  return {
    ...source,
    mapping: {
      sku: sku === undefined ? undefined : 0,
      ean: ean === undefined ? undefined : 1,
      name: name === undefined ? undefined : 2,
      value: value < 0 ? value : 3,
    },
    rows: source.rows.map((row, index) => {
      if (index < source.headerRow || (index > source.headerRow && isEmptyRow(row))) return []
      if (index > source.headerRow && isTotalRow(row)) return ['total']
      const selected = [at(row, sku), at(row, ean), at(row, name), at(row, value)]
      // Preserve the classification of rows that only contain unmapped cells.
      if (index > source.headerRow && isEmptyRow(selected)) selected.push(true)
      return selected
    }),
  }
}

export function buildImportPreview(
  products: Product[],
  revision: number,
  source: ImportSource,
): ImportPreview {
  const mapping = source.mapping
  if (!Number.isInteger(mapping.value) || mapping.value < 0)
    throw new Error('Seleccioná la columna que contiene el valor a actualizar.')
  if (
    (mapping.sku === undefined || mapping.sku < 0) &&
    (mapping.ean === undefined || mapping.ean < 0)
  )
    throw new Error('Seleccioná al menos una columna de código interno o EAN.')
  if (!Number.isInteger(source.headerRow) || source.headerRow < 0 || source.headerRow >= source.rows.length)
    throw new Error('La fila de encabezados no es válida.')
  if (source.kind === 'stock' && source.missingStockPolicy === 'zero' && !source.completeInventoryConfirmed)
    throw new Error('Confirmá que el archivo representa el inventario completo antes de poner ausentes en cero.')

  const bySku = new Map<string, Product[]>()
  const byEan = new Map<string, Product[]>()
  products.forEach((product) => {
    addIndex(bySku, normalizeSku(product.sku), product)
    addIndex(byEan, normalizeEan(product.barcode), product)
  })
  const header = source.rows[source.headerRow] ?? []
  const used = new Set<string>()
  const rows: ImportPreviewRow[] = []
  const changes: ImportChange[] = []
  let skipped = 0
  let analyzed = 0
  let matched = 0
  let unchanged = 0
  let unmatched = 0
  let duplicates = 0
  let ambiguous = 0
  let invalid = 0
  let hiddenByThreshold = 0
  let republishedByThreshold = 0

  for (let index = source.headerRow + 1; index < source.rows.length; index += 1) {
    const row = source.rows[index] ?? []
    if (isEmptyRow(row) || isTotalRow(row)) {
      skipped += 1
      continue
    }
    const sku = mapping.sku === undefined ? '' : normalizeSku(row[mapping.sku])
    const ean = mapping.ean === undefined ? '' : normalizeEan(row[mapping.ean])
    const name = mapping.name === undefined ? '' : String(row[mapping.name] ?? '').trim()
    const repeatedHeader =
      (mapping.sku !== undefined && normalizeHeader(row[mapping.sku]) === normalizeHeader(header[mapping.sku])) ||
      (mapping.ean !== undefined && normalizeHeader(row[mapping.ean]) === normalizeHeader(header[mapping.ean]))
    if (repeatedHeader) {
      skipped += 1
      continue
    }
    analyzed += 1
    if (!sku && !ean) {
      invalid += 1
      rows.push({ rowNumber: index + 1, product: name || 'Fila sin identificar', code: '', ean: '', status: 'invalid', message: 'Falta código interno y EAN.' })
      continue
    }
    const skuMatches = sku ? bySku.get(sku) ?? [] : []
    const eanMatches = ean ? byEan.get(ean) ?? [] : []
    let product: Product | undefined
    if (skuMatches.length === 1) product = skuMatches[0]
    else if (skuMatches.length > 1) {
      ambiguous += 1
      rows.push({ rowNumber: index + 1, product: name || 'Coincidencia ambigua', code: sku, ean, status: 'ambiguous', message: 'El código interno coincide con más de un producto.' })
      continue
    } else if (eanMatches.length === 1) product = eanMatches[0]
    else if (eanMatches.length > 1) {
      ambiguous += 1
      rows.push({ rowNumber: index + 1, product: name || 'Coincidencia ambigua', code: sku, ean, status: 'ambiguous', message: 'El EAN coincide con más de un producto.' })
      continue
    }
    if (!product) {
      unmatched += 1
      rows.push({ rowNumber: index + 1, product: name || 'Sin coincidencia', code: sku, ean, status: 'unmatched', message: 'No existe en el catálogo central.' })
      continue
    }
    if (skuMatches.length === 1 && eanMatches.length === 1 && skuMatches[0].id !== eanMatches[0].id) {
      ambiguous += 1
      rows.push({ rowNumber: index + 1, product: name || product.name, code: sku, ean, status: 'ambiguous', message: 'El código interno y el EAN señalan productos diferentes.' })
      continue
    }
    if (used.has(product.id)) {
      duplicates += 1
      rows.push({ rowNumber: index + 1, product: product.name, productId: product.id, code: product.sku ?? sku, ean: product.barcode ?? ean, status: 'duplicate', message: 'El mismo producto aparece más de una vez en el archivo.' })
      continue
    }
    used.add(product.id)
    matched += 1
    const parsed = parseArgentineNumber(row[mapping.value])
    const valid =
      Number.isFinite(parsed) &&
      parsed >= 0 &&
      (source.kind === 'price' ? parsed > 0 && Math.round(parsed * 100) === parsed * 100 : Number.isSafeInteger(parsed))
    if (!valid) {
      invalid += 1
      rows.push({ rowNumber: index + 1, product: product.name, productId: product.id, code: product.sku ?? sku, ean: product.barcode ?? ean, status: 'invalid', message: source.kind === 'stock' ? 'El stock debe ser un entero igual o mayor a cero.' : 'El precio debe ser positivo y tener hasta dos decimales.' })
      continue
    }
    const before = source.kind === 'stock' ? Number(product.stock ?? 0) : product.price
    const after = Math.round(parsed * 100) / 100
    const onlineBefore = product.available && hasOnlineStock(product.stock)
    const onlineAfter = product.available && hasOnlineStock(source.kind === 'stock' ? after : product.stock)
    if (before === after) {
      unchanged += 1
      rows.push({ rowNumber: index + 1, product: product.name, productId: product.id, code: product.sku ?? sku, ean: product.barcode ?? ean, before, after, status: 'unchanged', message: 'Sin cambios.', onlineBefore, onlineAfter })
      continue
    }
    if (onlineBefore && !onlineAfter) hiddenByThreshold += 1
    if (!onlineBefore && onlineAfter) republishedByThreshold += 1
    changes.push({ productId: product.id, sku: product.sku ?? '', ean: product.barcode ?? '', name: product.name, field: source.kind, before, after })
    rows.push({ rowNumber: index + 1, product: product.name, productId: product.id, code: product.sku ?? sku, ean: product.barcode ?? ean, before, after, status: 'change', message: 'Se actualizará.', onlineBefore, onlineAfter })
  }

  const missing = products.filter((product) => !used.has(product.id))
  if (source.kind === 'stock' && source.missingStockPolicy === 'zero') {
    for (const product of missing) {
      const before = Number(product.stock ?? 0)
      if (before === 0) continue
      const onlineBefore = product.available && hasOnlineStock(before)
      if (onlineBefore) hiddenByThreshold += 1
      changes.push({ productId: product.id, sku: product.sku ?? '', ean: product.barcode ?? '', name: product.name, field: 'stock', before, after: 0 })
      rows.push({ rowNumber: null, product: product.name, productId: product.id, code: product.sku ?? '', ean: product.barcode ?? '', before, after: 0, status: 'missing-zero', message: 'Ausente del inventario completo: se establecerá en cero.', onlineBefore, onlineAfter: false })
    }
  }

  return {
    kind: source.kind,
    baseRevision: revision,
    sourceRows: Math.max(0, source.rows.length - source.headerRow - 1),
    analyzed,
    matched,
    modified: changes.length,
    unchanged,
    unmatched,
    duplicates,
    ambiguous,
    invalid,
    skipped,
    missingProducts: missing.length,
    hiddenByThreshold,
    republishedByThreshold,
    criticalErrors: duplicates + ambiguous + invalid,
    rows,
    changes,
  }
}

export function applyImportChanges(products: Product[], changes: ImportChange[]) {
  const byId = new Map(changes.map((change) => [change.productId, change]))
  if (byId.size !== changes.length) throw new Error('La importación contiene productos duplicados.')
  return products.map((product) => {
    const change = byId.get(product.id)
    if (!change) return product
    const current = change.field === 'stock' ? Number(product.stock ?? 0) : product.price
    if (current !== change.before) throw new Error('El catálogo cambió desde la vista previa.')
    return change.field === 'stock'
      ? { ...product, stock: change.after }
      : { ...product, price: change.after }
  })
}

export function revertImportChanges(products: Product[], changes: ImportChange[]) {
  const byId = new Map(changes.map((change) => [change.productId, change]))
  return products.map((product) => {
    const change = byId.get(product.id)
    if (!change) return product
    const current = change.field === 'stock' ? Number(product.stock ?? 0) : product.price
    if (current !== change.after)
      throw new Error(`No se puede revertir: ${product.name} recibió otro cambio posterior.`)
    return change.field === 'stock'
      ? { ...product, stock: change.before }
      : { ...product, price: change.before }
  })
}
