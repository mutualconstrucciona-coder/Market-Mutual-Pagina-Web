'use client'

import Link from 'next/link'
import { useState } from 'react'
import { BrandLogo } from '@/components/market/brand-logo'
import { Menu, Search, Settings, ShoppingCart, X } from 'lucide-react'
import { Button } from '@/components/ui/button'

type HeaderProps = {
  query: string
  onQueryChange: (value: string) => void
  menuOpen: boolean
  onToggleMenu: () => void
  cartReady: boolean
  cartCount: number
  hasOffers: boolean
  onOpenCart: () => void
}

export function Header({
  query,
  onQueryChange,
  menuOpen,
  onToggleMenu,
  cartReady,
  cartCount,
  hasOffers,
  onOpenCart,
}: HeaderProps) {
  const readyCount = cartReady ? cartCount : null
  const [cartMotion, setCartMotion] = useState({ count: readyCount, bounce: false })

  if (cartMotion.count !== readyCount) {
    setCartMotion({
      count: readyCount,
      bounce: readyCount !== null && cartMotion.count !== null && readyCount > cartMotion.count,
    })
  }

  return (
    <>
      <div className="bg-[#0d2d55] px-4 py-2 text-[11px] font-semibold text-white/90 sm:text-xs">
        <p className="mx-auto max-w-7xl text-center text-balance leading-5">Mutual de los Trabajadores de la Construcción de la Patagonia - Conducción Raúl Silva</p>
      </div>
      <header className="sticky top-0 z-30 border-b border-[#dceaf7] bg-white/95 shadow-[0_8px_30px_rgba(18,53,95,0.06)] backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-3 px-4 py-3 lg:flex-nowrap lg:px-8">
          <a href="#inicio" className="flex shrink-0 items-center gap-2.5" aria-label="Market Mutual inicio">
            <BrandLogo />
          </a>
          <nav className="hidden min-w-0 flex-1 items-center justify-center gap-5 text-sm font-semibold text-slate-600 lg:flex">
            <a className="text-[#1456a0]" href="#inicio">Inicio</a><a href="#productos" className="hover:text-[#1456a0]">Productos</a><a href="#categorias" className="hover:text-[#1456a0]">Categorías</a>{hasOffers && <a href="#ofertas" className="hover:text-[#1456a0]">Ofertas</a>}<a href="#como-comprar" className="hover:text-[#1456a0]">Cómo comprar</a>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            <div className="hidden h-11 w-[min(24vw,320px)] items-center gap-2 rounded-2xl border border-[#dceaf7] bg-[#f3f8fd] px-4 md:flex"><Search className="size-4 text-[#4e7196]" /><input value={query} onChange={(event) => onQueryChange(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-[#7f98b2]" placeholder="Buscar productos" aria-label="Buscar productos" /></div>
            <Link href="/admin" className="hidden size-11 items-center justify-center rounded-2xl text-[#12355f] transition hover:bg-[#edf6fd] md:flex" aria-label="Abrir administración"><Settings className="size-4" /></Link>
            <Button
              variant="ghost"
              className="group relative h-12 min-w-[124px] justify-start gap-2.5 rounded-[18px] border-2 border-[#1456a0] bg-[#fff8f1] px-3 text-[#12355f] shadow-[0_5px_14px_rgba(20,86,160,0.12)] transition duration-200 hover:-translate-y-0.5 hover:border-[#0f4a8c] hover:bg-white hover:text-[#1456a0] hover:shadow-[0_8px_18px_rgba(20,86,160,0.2)] focus-visible:ring-[#7db7ed]"
              onClick={onOpenCart}
              aria-label={cartReady ? `Abrir carrito, ${cartCount} ${cartCount === 1 ? 'producto' : 'productos'}` : 'Abrir carrito'}
            >
              <span
                key={readyCount}
                className={`relative flex size-7 shrink-0 items-center justify-center ${cartMotion.bounce ? 'origin-[50%_75%] md:motion-safe:animate-[floating-cart-soft-bounce_520ms_cubic-bezier(0.22,1,0.36,1)]' : ''}`}
              >
                <ShoppingCart className="size-6 stroke-[1.8] text-[#7890ad]" />
                {cartReady && cartCount > 0 && <span className="absolute -right-2 -top-2 flex min-w-5 items-center justify-center rounded-full bg-[#1456a0] px-1.5 py-0.5 text-[10px] font-extrabold leading-4 text-white ring-2 ring-white">{cartCount}</span>}
              </span>
              <span className="text-sm font-extrabold leading-none">Tu carrito</span>
            </Button>
            <Button variant="ghost" size="icon" className="size-11 rounded-2xl lg:hidden" onClick={onToggleMenu} aria-label="Abrir menú">{menuOpen ? <X /> : <Menu />}</Button>
          </div>
          <label className="order-3 flex h-11 w-full items-center gap-3 rounded-2xl border border-[#dceaf7] bg-[#f3f8fd] px-4 md:hidden"><Search className="size-4 text-[#4e7196]" /><span className="sr-only">Buscar productos</span><input value={query} onChange={(event) => onQueryChange(event.target.value)} className="w-full bg-transparent text-sm outline-none placeholder:text-[#7f98b2]" placeholder="¿Qué estás buscando?" /></label>
        </div>
        {menuOpen && <nav className="flex flex-col gap-4 border-t border-[#e7f0f8] bg-white px-5 py-5 text-sm font-semibold lg:hidden"><a href="#inicio" onClick={onToggleMenu}>Inicio</a><a href="#productos" onClick={onToggleMenu}>Productos</a><a href="#categorias" onClick={onToggleMenu}>Categorías</a>{hasOffers && <a href="#ofertas" onClick={onToggleMenu}>Ofertas</a>}<a href="#como-comprar" onClick={onToggleMenu}>Cómo comprar</a><Link href="/admin" onClick={onToggleMenu}>Administración DEMO</Link></nav>}
      </header>
    </>
  )
}
