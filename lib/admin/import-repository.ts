import 'server-only'
import { catalogRepository } from '@/lib/admin/catalog-repository'
import { CatalogError } from '@/lib/admin/catalog-rules'
import {
  applyImportChanges,
  revertImportChanges,
  type ImportChange,
  type ImportKind,
  type ImportPreview,
  type ImportSource,
} from '@/lib/admin/import-rules'
import { supabaseConfigured, supabaseService } from '@/lib/supabase/server'

export type ImportHistoryItem = {
  id: string
  kind: ImportKind
  fileName: string
  fileHash: string
  fileSize: number
  sheetName: string
  actorEmail: string
  baseRevision: number
  appliedRevision: number
  status: 'applied' | 'reverted'
  stats: Omit<ImportPreview, 'rows' | 'changes'>
  createdAt: string
  revertedAt?: string
  revertedRevision?: number
}

type ImportRow = {
  id: string
  kind: ImportKind
  file_name: string
  file_hash: string
  file_size: number
  sheet_name: string
  actor_email: string
  base_revision: number
  applied_revision: number
  status: 'applied' | 'reverted'
  stats: Omit<ImportPreview, 'rows' | 'changes'>
  changes?: ImportChange[]
  created_at: string
  reverted_at?: string
  reverted_revision?: number
}

const historyItem = (row: ImportRow): ImportHistoryItem => ({
  id: row.id,
  kind: row.kind,
  fileName: row.file_name,
  fileHash: row.file_hash,
  fileSize: Number(row.file_size),
  sheetName: row.sheet_name,
  actorEmail: row.actor_email,
  baseRevision: Number(row.base_revision),
  appliedRevision: Number(row.applied_revision),
  status: row.status,
  stats: row.stats,
  createdAt: row.created_at,
  revertedAt: row.reverted_at,
  revertedRevision: row.reverted_revision ? Number(row.reverted_revision) : undefined,
})

async function adminEmail(actor: string) {
  const response = await supabaseService(`/auth/v1/admin/users/${encodeURIComponent(actor)}`)
  if (!response.ok) throw new CatalogError('No se pudo identificar al administrador.', 503)
  const user = (await response.json()) as { email?: string }
  if (!user.email) throw new CatalogError('La cuenta administrativa no tiene un correo válido.', 422)
  return user.email
}

export async function listImportHistory(): Promise<ImportHistoryItem[]> {
  if (!supabaseConfigured()) return []
  const response = await supabaseService(
    '/rest/v1/market_catalog_imports?select=id,kind,file_name,file_hash,file_size,sheet_name,actor_email,base_revision,applied_revision,status,stats,created_at,reverted_at,reverted_revision&order=created_at.desc&limit=50',
  )
  if (!response.ok) throw new CatalogError('No se pudo consultar el historial de importaciones.', 503)
  return ((await response.json()) as ImportRow[]).map(historyItem)
}

export async function applyCatalogImport(
  source: ImportSource,
  preview: ImportPreview,
  expectedRevision: number,
  actor: string,
) {
  if (!supabaseConfigured())
    throw new CatalogError('Las importaciones masivas requieren la conexión central de Supabase.', 503)
  if (preview.criticalErrors || !preview.changes.length)
    throw new CatalogError('Resolvé los errores críticos y verificá que existan cambios antes de confirmar.', 422)
  const snapshot = await catalogRepository().read()
  if (snapshot.revision !== expectedRevision || preview.baseRevision !== expectedRevision)
    throw new CatalogError('El catálogo cambió desde la vista previa. Volvé a revisar el archivo.', 409)
  let products
  try {
    products = applyImportChanges(snapshot.products, preview.changes)
  } catch (error) {
    throw new CatalogError(error instanceof Error ? error.message : 'El catálogo cambió.', 409)
  }
  const stats = { ...preview, rows: undefined, changes: undefined }
  delete stats.rows
  delete stats.changes
  const response = await supabaseService('/rest/v1/rpc/market_apply_catalog_import', {
    method: 'POST',
    body: JSON.stringify({
      p_expected_revision: expectedRevision,
      p_products: products,
      p_actor: actor,
      p_actor_email: await adminEmail(actor),
      p_kind: source.kind,
      p_file_name: source.fileName,
      p_file_hash: source.fileHash,
      p_file_size: source.fileSize,
      p_sheet_name: source.sheetName,
      p_stats: stats,
      p_changes: preview.changes,
    }),
  })
  if (!response.ok) {
    const detail = await response.text()
    if (detail.includes('market_duplicate_import'))
      throw new CatalogError('Este mismo archivo ya fue aplicado para este tipo de importación.', 409)
    if (detail.includes('market_revision_conflict'))
      throw new CatalogError('Otra persona modificó el catálogo. Volvé a generar la vista previa.', 409)
    throw new CatalogError('Supabase no pudo aplicar la importación. No se guardó ningún cambio.', 503)
  }
  return { ...snapshot, products, revision: expectedRevision + 1 }
}

export async function revertCatalogImport(importId: string, expectedRevision: number, actor: string) {
  if (!supabaseConfigured())
    throw new CatalogError('La reversión requiere la conexión central de Supabase.', 503)
  if (!/^[a-f0-9-]{36}$/.test(importId)) throw new CatalogError('La importación no es válida.', 422)
  const response = await supabaseService(
    `/rest/v1/market_catalog_imports?select=*&id=eq.${encodeURIComponent(importId)}&limit=1`,
  )
  if (!response.ok) throw new CatalogError('No se pudo consultar la importación.', 503)
  const row = ((await response.json()) as ImportRow[])[0]
  if (!row) throw new CatalogError('No se encontró la importación.', 404)
  if (row.status !== 'applied') throw new CatalogError('Esta importación ya fue revertida.', 409)
  const snapshot = await catalogRepository().read()
  if (snapshot.revision !== expectedRevision)
    throw new CatalogError('El catálogo cambió. Actualizá el historial antes de revertir.', 409)
  let products
  try {
    products = revertImportChanges(snapshot.products, row.changes ?? [])
  } catch (error) {
    throw new CatalogError(
      error instanceof Error ? error.message : 'Hay cambios posteriores incompatibles.',
      409,
    )
  }
  const reverted = await supabaseService('/rest/v1/rpc/market_revert_catalog_import', {
    method: 'POST',
    body: JSON.stringify({
      p_import_id: importId,
      p_expected_revision: expectedRevision,
      p_products: products,
      p_actor: actor,
    }),
  })
  if (!reverted.ok) {
    const detail = await reverted.text()
    if (detail.includes('market_revision_conflict'))
      throw new CatalogError('Otra persona modificó el catálogo. Actualizá antes de revertir.', 409)
    throw new CatalogError('No se pudo revertir la importación. No se guardó ningún cambio.', 503)
  }
  return { ...snapshot, products, revision: expectedRevision + 1 }
}
