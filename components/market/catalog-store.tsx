'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ReactNode } from 'react'
import type { Product } from '@/lib/market-data'
import { featuredFlyers } from '@/lib/featured-flyers'
import type { FeaturedFlyer } from '@/lib/featured-flyers'
import type { CatalogMeta } from '@/lib/catalog-storage'
import {
  productImageCandidates,
  productImagePilotReport,
} from '@/lib/product-images'
import type {
  ProductImageAssociation,
  ProductImageCandidate,
  ProductImagePilotReport,
} from '@/lib/product-images'

export type CatalogCategory = { name: string; count: number }
type CatalogContextValue = {
  products: Product[]
  flyers: FeaturedFlyer[]
  categories: CatalogCategory[]
  ready: boolean
  source: 'demo' | 'imported' | 'posberry'
  meta: CatalogMeta | null
  storageError: string | null
  refreshCatalog: () => Promise<void>
  imageAssociations: ProductImageAssociation[]
  imageCandidates: ProductImageCandidate[]
  imagePilotReport: ProductImagePilotReport
  replaceCatalog: (products: Product[], meta: CatalogMeta) => Promise<void>
  reviewImageCandidate: (
    candidate: ProductImageCandidate,
    status: 'approved' | 'rejected',
    imageUrl?: string,
  ) => Promise<void>
  clearCatalog: () => Promise<void>
}
const CatalogContext = createContext<CatalogContextValue | undefined>(undefined)

// The old importer is retained for reference but cannot replace the shared shop
// through IndexedDB. Current reads and writes go through server APIs.
async function legacyImportDisabled(): Promise<void> {
  throw new Error(
    'La importación anterior está deshabilitada. Usá el panel de productos conectado al servidor.',
  )
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([])
  const [flyers, setFlyers] = useState<FeaturedFlyer[]>([])
  const [ready, setReady] = useState(false)
  const [storageError, setStorageError] = useState<string | null>(null)
  // La tienda ya no reemplaza 753 productos si el servidor conserva la misma revisión.
  const loadedRevision = useRef<number | null>(null)
  const refreshCatalog = useCallback(async () => {
    const response = await fetch('/api/catalog', { cache: 'no-store' })
    const result = await response.json()
    if (!response.ok)
      throw new Error(result.error || 'No pudimos leer el catálogo.')
    if (loadedRevision.current !== result.revision) {
      loadedRevision.current = result.revision
      setProducts(result.products)
      setFlyers(result.flyers ?? featuredFlyers)
    }
    setStorageError(null)
    setReady(true)
  }, [])
  useEffect(() => {
    let active = true
    const refresh = () => {
      if (active)
        void refreshCatalog().catch((error) => {
          if (active) {
            setStorageError(
              error instanceof Error
                ? error.message
                : 'No pudimos leer el catálogo.',
            )
            setReady(true)
          }
        })
    }
    refresh()
    // Comprobación moderada: evita volver a descargar el catálogo cada 15 segundos.
    const interval = window.setInterval(() => { if (!document.hidden) refresh() }, 60000)
    window.addEventListener('focus', refresh)
    window.addEventListener('catalog-updated', refresh)
    return () => {
      active = false
      clearInterval(interval)
      window.removeEventListener('focus', refresh)
      window.removeEventListener('catalog-updated', refresh)
    }
  }, [refreshCatalog])
  const categories = useMemo(() => {
    const counts = new Map<string, number>()
    products
      .filter((p) => p.available && p.stock != null && p.stock > 0)
      .forEach((p) => counts.set(p.category, (counts.get(p.category) ?? 0) + 1))
    return Array.from(counts, ([name, count]) => ({ name, count })).sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'),
    )
  }, [products])
  return (
    <CatalogContext.Provider
      value={{
        products,
        flyers,
        categories,
        ready,
        source: 'posberry',
        meta: null,
        storageError,
        refreshCatalog,
        imageAssociations: [],
        imageCandidates: productImageCandidates,
        imagePilotReport: productImagePilotReport,
        replaceCatalog: legacyImportDisabled,
        reviewImageCandidate: legacyImportDisabled,
        clearCatalog: legacyImportDisabled,
      }}
    >
      {children}
    </CatalogContext.Provider>
  )
}
export function useCatalog() {
  const context = useContext(CatalogContext)
  if (!context)
    throw new Error('useCatalog debe usarse dentro de CatalogProvider')
  return context
}
