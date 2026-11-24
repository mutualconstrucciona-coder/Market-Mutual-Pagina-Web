'use client'

import Image from 'next/image'

type FloatingCartButtonProps = {
  cartReady: boolean
  cartCount: number
  onOpenCart: () => void
}

export function FloatingCartButton({
  cartReady,
  cartCount,
  onOpenCart,
}: FloatingCartButtonProps) {
  if (!cartReady) return null

  const productLabel = cartCount === 1 ? 'producto' : 'productos'
  const visibleCount = cartCount > 99 ? '99+' : cartCount

  return (
    <button
      type="button"
      onClick={onOpenCart}
      className="floating-cart-entry fixed right-4 bottom-[calc(env(safe-area-inset-bottom)+5.75rem)] z-40 flex size-[4.25rem] items-center justify-center rounded-full border-2 border-[#1456a0] bg-gradient-to-br from-white via-[#f2f5f8] to-[#dce4ec] shadow-[0_12px_28px_rgba(18,53,95,0.24),inset_0_1px_0_rgba(255,255,255,0.95)] ring-4 ring-white/90 transition duration-200 hover:-translate-y-0.5 hover:shadow-[0_15px_32px_rgba(18,53,95,0.28)] active:scale-95 focus-visible:outline-3 focus-visible:outline-offset-3 focus-visible:outline-[#63a9e8] md:hidden"
      aria-label={`Abrir carrito flotante, ${cartCount} ${productLabel}`}
    >
      <Image
        src="/icons/market-cart.svg"
        alt=""
        aria-hidden="true"
        width={42}
        height={41}
        className="h-[2.58rem] w-[2.65rem] object-contain drop-shadow-[0_2px_2px_rgba(1,45,108,0.12)]"
      />
      {cartCount > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-2 -top-2 flex min-h-8 min-w-8 items-center justify-center rounded-full border-2 border-white bg-[#1456a0] px-2 text-sm font-black leading-none text-white shadow-[0_5px_14px_rgba(18,53,95,0.32)] ring-1 ring-[#1456a0]/20"
        >
          {visibleCount}
        </span>
      )}
    </button>
  )
}
