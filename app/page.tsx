'use client'

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { BenefitsSection } from '@/components/market/benefits-section'
import { CartDrawer } from '@/components/market/cart-drawer'
import { DeliverySection } from '@/components/market/delivery-section'
import { Footer } from '@/components/market/footer'
import { Header } from '@/components/market/header'
import { Hero } from '@/components/market/hero'
import { FeaturedCarousel } from '@/components/market/featured-carousel'
import { FeaturedProducts } from '@/components/market/featured-products'
import { FloatingCartButton } from '@/components/market/floating-cart-button'
import { HowToBuySection } from '@/components/market/how-to-buy-section'
import { OffersSection } from '@/components/market/offers-section'
import { PaymentMethodsSection } from '@/components/market/payment-methods-section'
import { MobileBottomNav } from '@/components/market/mobile-bottom-nav'
import { ProductSection } from '@/components/market/product-section'
import { useCart } from '@/components/market/cart-store'
import { useCatalog } from '@/components/market/catalog-store'
import { matchesProductSearch } from '@/lib/product-search'
import type { Product } from '@/lib/market-data'

export default function Page() {
  const { cartCount, ready, addToCart } = useCart()
  const { products, flyers, categories, source, storageError, refreshCatalog, ready: catalogReady } = useCatalog()
  const [query, setQuery] = useState('')
  const [cartOpen, setCartOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [category, setCategory] = useState('Todos')
  const [visibleCount, setVisibleCount] = useState(48)
  const deferredQuery = useDeferredValue(query)
  // Evita recrear los 48+ botones de producto cada vez que cambia el carrito.
  const addToCartRef = useRef(addToCart)
  useEffect(() => { addToCartRef.current = addToCart }, [addToCart])
  const handleAddToCart = useCallback((product: Product) => {
    addToCartRef.current(product.id)
  }, [])

  const availableProducts = useMemo(
    () => products.filter((product) => product.available && product.stock != null && product.stock > 0),
    [products],
  )

  const visibleProducts = useMemo(() => availableProducts.filter((product) => {
    const matchesQuery = matchesProductSearch(product, deferredQuery)
    const matchesCategory = category === 'Todos' || product.category === category
    return matchesQuery && matchesCategory
  }), [deferredQuery, category, availableProducts])

  const offerProducts = useMemo(() => availableProducts.filter((product) => product.offer === true), [availableProducts])
  const featuredProducts = useMemo(() => availableProducts.filter(p => p.featured).sort((a,b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0)), [availableProducts])
  const paginatedProducts = useMemo(() => visibleProducts.slice(0, visibleCount), [visibleProducts, visibleCount])

  const changeQuery = useCallback((value: string) => {
    setQuery(value)
    setCategory('Todos')
    setVisibleCount(48)
  }, [])

  const changeCategory = useCallback((value: string) => {
    setCategory(value)
    setVisibleCount(48)
  }, [])

  const loadMoreProducts = useCallback(() => setVisibleCount((current) => current + 48), [])

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,#f4f9fe_0%,#f8fbfe_44%,#f4f8fc_100%)] pb-24 text-[#12243b] md:pb-0">
      <Header
        query={query}
        onQueryChange={changeQuery}
        menuOpen={menuOpen}
        onToggleMenu={() => setMenuOpen(!menuOpen)}
        cartCount={cartCount}
        cartReady={ready}
        hasOffers={offerProducts.length > 0}
        onOpenCart={() => setCartOpen(true)}
      />
      {source === 'demo' && <p className="px-4 pt-4 text-center text-xs text-amber-800">Catálogo de demostración · Productos y precios ilustrativos.</p>}
      <Hero hasOffers={offerProducts.length > 0} />
      <FeaturedCarousel key={flyers.map(flyer => flyer.id).join('|')} flyers={flyers} />
      {storageError && <div role="alert" className="mx-auto max-w-7xl px-4 py-5 text-red-800">{storageError} <button className="underline" onClick={() => { void refreshCatalog().catch(() => {}) }}>Volver a intentar</button></div>}
      {!catalogReady && <p role="status" className="px-4 py-8 text-center text-slate-600">Cargando productos…</p>}
      <FeaturedProducts products={featuredProducts} onAdd={handleAddToCart} />
      <OffersSection products={offerProducts} onAdd={handleAddToCart} />
      <ProductSection
        products={paginatedProducts}
        total={visibleProducts.length}
        categories={categories}
        category={category}
        query={query}
        onQueryChange={changeQuery}
        onSelectCategory={changeCategory}
        onLoadMore={loadMoreProducts}
        onAdd={handleAddToCart}
      />
      <BenefitsSection />
      <HowToBuySection />
      <PaymentMethodsSection />
      <DeliverySection />
      <Footer hasOffers={offerProducts.length > 0} />
      <p className="sr-only" role="status" aria-atomic="true">{ready ? `Carrito: ${cartCount} ${cartCount === 1 ? 'producto' : 'productos'}.` : ''}</p>
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
      <FloatingCartButton cartReady={ready} cartCount={cartCount} onOpenCart={() => setCartOpen(true)} />
      <MobileBottomNav onOpenCart={() => setCartOpen(true)} />
    </main>
  )
}
