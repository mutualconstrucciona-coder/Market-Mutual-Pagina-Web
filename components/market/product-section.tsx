'use client'

import { Search, X } from 'lucide-react'
import { memo } from 'react'
import { Button } from '@/components/ui/button'
import { CategorySection } from '@/components/market/category-section'
import type { CatalogCategory } from '@/components/market/catalog-store'
import { ProductCard } from '@/components/market/product-card'
import type { Product } from '@/lib/market-data'

type ProductSectionProps = {
  products: Product[]
  total: number
  categories: CatalogCategory[]
  category: string
  query: string
  onQueryChange: (value: string) => void
  onSelectCategory: (name: string) => void
  onLoadMore: () => void
  onAdd: (product: Product) => void
}

export const ProductSection = memo(function ProductSection({ products, total, categories, category, query, onQueryChange, onSelectCategory, onLoadMore, onAdd }: ProductSectionProps) {
  return (
    <section id="productos" className="scroll-mt-36 py-8 sm:py-10">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <h2 className="mb-6 text-2xl font-extrabold tracking-tight text-[#102f53] sm:text-3xl">Comprá por categoría</h2>
        <CategorySection categories={categories} selected={category} onSelect={onSelectCategory} />
        <div className="my-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div role="search" className="flex h-12 w-full items-center gap-3 rounded-2xl border border-[#dce5ed] bg-white px-4 shadow-sm focus-within:border-[#1456a0] focus-within:ring-2 focus-within:ring-[#1456a0]/15 sm:max-w-xl">
            <Search className="size-5 shrink-0 text-[#607b99]" aria-hidden="true" />
            <input type="search" value={query} onChange={event => onQueryChange(event.target.value)} placeholder="Buscá productos, marcas o palabras clave" aria-label="Buscar en todos los productos" aria-describedby="search-help" className="min-w-0 flex-1 bg-transparent text-sm outline-none [&::-webkit-search-cancel-button]:appearance-none placeholder:text-[#607b99]" />
            {query && <button type="button" onClick={() => onQueryChange('')} aria-label="Limpiar búsqueda" className="flex size-9 shrink-0 items-center justify-center rounded-full text-[#607b99] hover:bg-slate-100"><X className="size-4" /></button>}
          </div>
          <p role="status" aria-atomic="true" className="text-sm font-semibold text-[#607b99]">{total.toLocaleString('es-AR')} {total === 1 ? 'producto' : 'productos'}{category !== 'Todos' ? ` en ${category}` : ''}</p>
        </div>
        <p id="search-help" className="-mt-3 mb-6 text-xs leading-5 text-[#607b99]">Probá con “fideos”, “pastas” o una marca. También reconocemos palabras similares.</p>
        {products.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-6 py-16 text-center"><p className="font-bold text-[#12355f]">No encontramos productos</p><p className="mt-2 text-sm text-slate-500">Probá con otra palabra o elegí otra categoría.</p><Button variant="outline" className="mt-4" onClick={() => { onQueryChange(''); onSelectCategory('Todos') }}>Ver todos los productos</Button></div>
        ) : <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} />)}
        </div>}
        {products.length < total && <div className="mt-9 flex justify-center"><Button variant="outline" className="rounded-full border-[#1456a0] bg-white px-6 text-[#1456a0] shadow-sm" onClick={onLoadMore}>Mostrar 48 productos más</Button></div>}
      </div>
    </section>
  )
})
