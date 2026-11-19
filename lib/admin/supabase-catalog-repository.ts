import 'server-only'
import { randomUUID } from 'node:crypto'
import type { CatalogRepository } from '@/lib/admin/catalog-repository'
import type { CatalogCommand, CatalogSnapshot } from '@/lib/admin/catalog-rules'
import { CatalogError, applyCatalogCommand } from '@/lib/admin/catalog-rules'
import { supabaseService } from '@/lib/supabase/server'

type CatalogRow = {
  revision: number
  products: CatalogSnapshot['products']
  families: string[]
  flyers: NonNullable<CatalogSnapshot['flyers']>
}
export class SupabaseCatalogRepository implements CatalogRepository {
  async read(): Promise<CatalogSnapshot> {
    const res = await supabaseService('/rest/v1/market_catalog_state?select=revision,products,families,flyers&id=eq.1&limit=1')
    if (!res.ok) throw new CatalogError('No se pudo consultar el catálogo central.', 503)
    const rows = await res.json() as CatalogRow[]
    if (!rows.length) throw new CatalogError('El catálogo central aún no fue importado.', 503)
    const row = rows[0]
    return {revision: Number(row.revision), products: row.products, families: row.families, flyers: row.flyers }
  }
  async mutate(revision: number, command: CatalogCommand, actor: string) {
    if (!/^[a-f0-9-]{36}$/.test(actor)) throw new CatalogError('Acceso no autorizado.', 403)
    const current = await this.read()
    if (!Number.isSafeInteger(revision) || current.revision !== revision)
      throw new CatalogError('El catálogo cambió en otra sesión. Actualizá y volvé a intentarlo.', 409)
    const next = applyCatalogCommand(current, command, 'admin:' + randomUUID())
    const res = await supabaseService('/rest/v1/rpc/market_commit_catalog', {
      method: 'POST',
      body: JSON.stringify({
        p_expected_revision: revision,
        p_products: next.products,
        p_families: next.families,
        p_flyers: next.flyers ?? [],
        p_actor: actor,
        p_action: command.type,
      }),
    })
    if (!res.ok) {
      const error = await res.text()
      if (error.includes('market_revision_conflict'))
        throw new CatalogError('Otra persona modificó el catálogo. Actualizá antes de guardar.', 409)
      throw new CatalogError('No se pudo guardar el catálogo central.', 503)
    }
    return next
  }
}
