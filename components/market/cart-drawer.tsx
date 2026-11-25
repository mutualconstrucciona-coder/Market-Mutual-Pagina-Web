'use client'

import { ArrowRight, Minus, Plus, ShoppingBag, Trash2, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'
import { useCart } from '@/components/market/cart-store'

type CartDrawerProps = {
  open: boolean
  onClose: () => void
}

export function CartDrawer({ open, onClose }: CartDrawerProps) {
  const router = useRouter()
  const { cart, cartItems, cartCount, subtotal, cartNotice, clearCartNotice, updateQuantity, removeFromCart } = useCart()

  const goToCheckout = () => {
    onClose()
    router.push('/checkout')
  }

  return (
    <div
      className={`fixed inset-0 z-50 transition-[visibility] duration-0 motion-reduce:transition-none ${open ? 'visible' : 'invisible delay-[360ms]'}`}
      aria-hidden={!open}
      inert={!open}
    >
      <button
        className={`absolute inset-0 bg-[#061a30]/45 transition-opacity duration-300 ease-out motion-reduce:transition-none ${open ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
        aria-label="Cerrar carrito"
      />
      <aside
        className={`absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-white p-5 shadow-2xl transition-transform duration-[360ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full'}`}
        aria-label="Carrito de compras"
      >
        <div className="flex items-center justify-between border-b border-slate-200 pb-5">
          <div><p className="text-xs font-bold uppercase tracking-widest text-[#2581d2]">Tu pedido</p><h2 className="mt-1 text-xl font-bold text-[#12355f]">Carrito <span className="text-slate-400">({cartCount})</span></h2></div>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Cerrar carrito"><X /></Button>
        </div>
        {cartNotice && <button type="button" onClick={clearCartNotice} className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-left text-xs font-semibold text-amber-800" role="status">{cartNotice} <span className="ml-1 underline">Cerrar</span></button>}
        <div className="flex-1 overflow-y-auto py-5">
          {cartItems.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center text-center"><span className="flex size-16 items-center justify-center rounded-2xl bg-[#e7f2fc] text-[#1456a0]"><ShoppingBag /></span><h3 className="mt-4 font-bold text-[#12355f]">Tu carrito está vacío</h3><p className="mt-1 text-sm text-slate-500">Sumá productos para armar tu pedido.</p></div>
          ) : (
            <div className="flex flex-col gap-4">
              {cartItems.map((product) => (
                <div key={product.id} className="flex gap-3">
                  {/* Las imágenes importadas pueden venir de cualquier proveedor; se usa img en este prototipo local. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={product.image || '/placeholder-product.svg'} alt="" decoding="async" className="size-16 rounded-xl bg-white object-contain object-center p-1" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-[#16385f]">{product.name}</p>
                    <p className="mt-1 text-sm font-semibold text-[#1456a0]">{formatMoney(product.price)}</p>
                    <div className="mt-2 flex items-center gap-2">
                      <button onClick={() => updateQuantity(product.id, cart[product.id] - 1)} className="flex size-7 items-center justify-center rounded-md bg-slate-100" aria-label="Disminuir cantidad"><Minus className="size-3" /></button>
                      <span className="w-4 text-center text-sm font-bold">{cart[product.id]}</span>
                      <button onClick={() => updateQuantity(product.id, cart[product.id] + 1)} className="flex size-7 items-center justify-center rounded-md bg-slate-100" aria-label="Aumentar cantidad"><Plus className="size-3" /></button>
                    </div>
                  </div>
                  <div className="flex flex-col items-center gap-2">
                    <p className="text-sm font-bold text-[#12355f]">{formatMoney(product.price * cart[product.id])}</p>
                    <button onClick={() => removeFromCart(product.id)} className="flex size-7 items-center justify-center rounded-md bg-slate-100 text-[#c02929] hover:bg-red-100" aria-label={`Eliminar ${product.name}`}><Trash2 className="size-3" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {cartItems.length > 0 && (
          <div className="border-t border-slate-200 pt-5">
            <div className="flex items-center justify-between text-sm text-slate-500"><span>Subtotal</span><span className="text-2xl font-bold text-[#12355f]">{formatMoney(subtotal)}</span></div>
            <p className="mt-2 text-xs leading-5 text-slate-400">Los beneficios correspondientes se verificarán al confirmar el pedido.</p>
            <Button className="mt-5 w-full rounded-xl bg-[#1456a0] py-6 text-white hover:bg-[#0d4381] hover:text-white" onClick={goToCheckout}>Continuar pedido <ArrowRight data-icon="inline-end" /></Button>
          </div>
        )}
      </aside>
    </div>
  )
}
