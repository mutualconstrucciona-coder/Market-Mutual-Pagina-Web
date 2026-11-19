// Server-only boundary: never import this module from a client component.
import { randomUUID } from 'node:crypto'
import { supabaseConfigured } from '@/lib/supabase/server'
import { SupabaseCatalogRepository } from './supabase-catalog-repository'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import type { Product } from '@/lib/market-data'
import { featuredFlyers } from '@/lib/featured-flyers'
import { applyProductImageAssociations } from '@/lib/product-images'
import { applyCatalogCommand, CatalogError } from './catalog-rules'
import type { CatalogCommand, CatalogSnapshot } from './catalog-rules'

/** A central adapter must transact version checks, validation, writes and audit together. */
export interface CatalogRepository {
  read(): Promise<CatalogSnapshot>
  mutate(
    revision: number,
    command: CatalogCommand,
    actor: string,
  ): Promise<CatalogSnapshot>
}

export const developmentDataDir = () =>
  path.resolve(process.env.MARKET_ADMIN_DATA_DIR || '.market-admin')
export function localAdminEnabled() {
  return (
    process.env.NODE_ENV === 'development' &&
    process.env.MARKET_ADMIN_LOCAL !== '0'
  )
}

async function bundled(): Promise<CatalogSnapshot> {
  const data = JSON.parse(
    await readFile(
      path.join(process.cwd(), 'public/data/catalog-posberry.json'),
      'utf8',
    ),
  )
  const products = applyProductImageAssociations(data.products as Product[], [])
  return {
    revision: 0,
    products,
    flyers: featuredFlyers,
    families: [...new Set(products.map((p) => p.category))].sort((a, b) =>
      a.localeCompare(b, 'es'),
    ),
  }
}

// Serializes local mutations within the Next process; central adapters require DB transactions.
const state = globalThis as typeof globalThis & {
  marketCatalogWrite?: Promise<unknown>
}
class DevelopmentCatalogRepository implements CatalogRepository {
  async read() {
    if (!localAdminEnabled()) return bundled()
    try {
      const saved = JSON.parse(
        await readFile(path.join(developmentDataDir(), 'catalog.json'), 'utf8'),
      ) as CatalogSnapshot
      return { ...saved, flyers: saved.flyers ?? featuredFlyers }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return bundled()
      throw error
    }
  }
  async mutate(revision: number, command: CatalogCommand, actor: string) {
    const task = (state.marketCatalogWrite ?? Promise.resolve())
      .catch(() => {})
      .then(async () => {
        if (!localAdminEnabled())
          throw new CatalogError(
            'La administración online todavía no está configurada.',
            503,
          )
        const current = await this.read()
        if (!Number.isSafeInteger(revision) || current.revision !== revision)
          throw new CatalogError(
            'Otra persona o pestaña modificó el catálogo. Actualizá el listado y revisá los cambios antes de guardar.',
            409,
          )
        const next = applyCatalogCommand(
          current,
          command,
          `admin:${randomUUID()}`,
        )
        if (
          command.type === 'save' &&
          command.product.image?.startsWith('/api/catalog/images/')
        ) {
          const fileName = command.product.image.split('/').at(-1)!
          try {
            await readFile(path.join(developmentDataDir(), 'uploads', fileName))
          } catch {
            throw new CatalogError(
              'No encontramos la foto subida. Volvé a seleccionarla antes de guardar.',
              422,
              { image: 'Volvé a subir la foto.' },
            )
          }
        }
        if (command.type === 'flyers') {
          for (const flyer of next.flyers ?? []) {
            for (const image of [flyer.image, flyer.mobileImage]) {
              if (image?.startsWith('/api/catalog/images/')) {
                try {
                  await readFile(
                    path.join(
                      developmentDataDir(),
                      'uploads',
                      image.split('/').at(-1)!,
                    ),
                  )
                } catch {
                  throw new CatalogError(
                    'No encontramos una imagen del flyer. Volvé a subirla antes de guardar.',
                    422,
                  )
                }
              }
            }
          }
        }
        const dir = developmentDataDir()
        await mkdir(dir, { recursive: true })
        const target = path.join(dir, 'catalog.json')
        const temp = path.join(dir, `catalog-${randomUUID()}.tmp`)
        // Audit is included in the same atomic file replacement as the catalog.
        const oldAudit =
          (current as CatalogSnapshot & { audit?: unknown[] }).audit ?? []
        await writeFile(
          temp,
          JSON.stringify({
            ...next,
            audit: [
              ...oldAudit,
              {
                actor,
                at: new Date().toISOString(),
                type: command.type,
                revision: next.revision,
              },
            ],
          }),
          { flag: 'wx' },
        )
        await rename(temp, target)
        return next
      })
    state.marketCatalogWrite = task
    return task
  }
}

// Replace this factory with a database adapter only after session/role validation exists.
export function catalogRepository(): CatalogRepository {
  return supabaseConfigured() ? new SupabaseCatalogRepository() : new DevelopmentCatalogRepository()
}
