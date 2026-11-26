'use client'

import Link from 'next/link'
import { useCart } from '@/components/market/cart-store'
import { cn, formatMoney } from '@/lib/utils'

export function OrderSummary({ className }: { className?: string } = {}) {
  const { cart, cartItems, cartCount, subtotal } = useCart()

  if (cartItems.length === 0) return null

  return (
    <section className={cn('min-w-0 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6', className)}>
      <div className="mb-4"><p className="text-xs font-bold uppercase tracking-widest text-[#2581d2]">Tu pedido</p><h2 className="mt-1 text-xl font-bold text-[#12355f]">Resumen ({cartCount})</h2></div>
      <ul className="flex flex-col gap-2 text-sm">
        {cartItems.map((product) => (
          <li key={product.id} className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 flex-1 break-words text-[#16385f] lg:truncate">
              <span className="font-semibold text-[#1456a0]">{cart[product.id]} x</span> {product.name}
            </span>
            <span className="shrink-0 whitespace-nowrap text-slate-600">{formatMoney(product.price * cart[product.id])}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3 text-sm">
        <span className="font-semibold text-[#12355f]">Subtotal</span>
        <span className="text-lg font-bold text-[#12355f]">{formatMoney(subtotal)}</span>
      </div>
      <Link href="/#productos" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-[#1456a0] hover:underline">← Seguir comprando</Link>
    </section>
  )
}
