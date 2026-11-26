'use client'

import { useState } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/market/brand-logo'
import { ShoppingBag } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CartDrawer } from '@/components/market/cart-drawer'
import { CheckoutForm } from '@/components/market/checkout-form'
import { Footer } from '@/components/market/footer'
import { OrderSummary } from '@/components/market/order-summary'
import { useCart } from '@/components/market/cart-store'

export default function CheckoutPage() {
  const { ready, cartCount } = useCart()
  const [cartOpen, setCartOpen] = useState(false)

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#f7f9fc] text-[#12243b]">
        <p className="text-sm text-slate-500">Cargando tu pedido…</p>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-[#f7f9fc] text-[#12243b]">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-4 py-4 sm:gap-5 lg:px-8">
          <Link href="/#inicio" className="flex shrink-0 items-center gap-2.5" aria-label="Market Mutual inicio">
            <BrandLogo />
          </Link>
          <nav className="ml-auto flex min-w-0 items-center gap-2">
            <Link href="/" className="text-sm font-semibold text-slate-600 hover:text-[#1456a0]">← Volver a la tienda</Link>
            <Button variant="ghost" size="icon" className="relative rounded-xl text-[#12355f]" onClick={() => setCartOpen(true)} aria-label="Abrir carrito"><ShoppingBag />{cartCount > 0 && <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-[#ee6b4d] text-[10px] font-bold text-white">{cartCount}</span>}</Button>
          </nav>
        </div>
      </header>

      {cartCount === 0 ? (
        <section className="mx-auto flex max-w-7xl flex-col items-center justify-center px-4 py-24 text-center lg:px-8">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-[#e7f2fc] text-[#1456a0]"><ShoppingBag /></span>
          <h1 className="mt-4 text-2xl font-bold text-[#12355f]">Tu carrito está vacío</h1>
          <p className="mt-1 text-sm text-slate-500">Sumá productos para armar tu pedido y volvé cuando quieras.</p>
          <Link href="/#productos" className="mt-6"><Button size="lg" className="rounded-xl bg-[#1456a0] px-6 hover:bg-[#0d4381]">Ver productos</Button></Link>
        </section>
      ) : (
        <section className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 lg:grid-cols-2 lg:px-8">
          <CheckoutForm />
          <OrderSummary className="hidden lg:block" />
        </section>
      )}

      <Footer />
      <CartDrawer open={cartOpen} onClose={() => setCartOpen(false)} />
    </main>
  )
}
