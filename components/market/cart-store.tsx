'use client'

import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useCatalog } from '@/components/market/catalog-store'
import type { Product } from '@/lib/market-data'

const STORAGE_KEY = 'market-mutual-cart-v2'

type Cart = Record<string, number>

type CartContextValue = {
  cart: Cart
  ready: boolean
  cartItems: Product[]
  cartCount: number
  subtotal: number
  cartNotice: string | null
  addToCart: (productId: string) => void
  updateQuantity: (productId: string, quantity: number) => void
  removeFromCart: (productId: string) => void
  clearCart: () => void
  clearCartNotice: () => void
}

const CartContext = createContext<CartContextValue | undefined>(undefined)

function isCart(value: unknown): value is Cart {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  return Object.values(value).every((quantity) => typeof quantity === 'number' && Number.isInteger(quantity) && quantity > 0)
}

function loadCart(): Cart {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed: unknown = JSON.parse(raw)
      if (isCart(parsed)) return parsed
    }
  } catch {
    // Ignorar errores de lectura (ej. almacenamiento corrupto o bloqueado).
  }
  return {}
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { products, ready: catalogReady } = useCatalog()
  const [cart, setCart] = useState<Cart>({})
  const [cartNotice, setCartNotice] = useState<string | null>(null)
  // Servidor y primer render del cliente parten del mismo carrito vacío. El
  // contenido persistido se restaura después de hidratar, sin borrar compras.
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // localStorage es una fuente externa y solo está disponible en el cliente.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart(loadCart())
    setMounted(true)
  }, [])

  const ready = mounted && catalogReady

  useEffect(() => {
    if (!ready) return
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cart))
    } catch {
      // Ignorar errores de escritura (ej. modo privado con almacenamiento bloqueado).
    }
  }, [cart, ready])

  useEffect(() => {
    if (!ready) return
    const productMap = new Map(products.map((product) => [product.id, product]))
    // El catálogo persistido es una fuente externa: al reemplazarlo, se descartan
    // referencias del carrito que ya no existen o superan el stock importado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCart((current) => {
      let changed = false
      const next: Cart = {}
      Object.entries(current).forEach(([productId, quantity]) => {
        const product = productMap.get(productId)
        if (!product || !product.available) {
          changed = true
          return
        }
        const allowed = product.stock == null ? quantity : Math.min(quantity, product.stock)
        if (allowed !== quantity) changed = true
        if (allowed > 0) next[productId] = allowed
      })
      return changed ? next : current
    })
  }, [products, ready])

  const addToCart = (productId: string) => {
    const product = products.find((item) => item.id === productId)
    if (!product?.available) return
    if (product.stock != null && (cart[productId] ?? 0) >= product.stock) {
      setCartNotice('No podés agregar más unidades de este producto.')
      return
    }
    setCartNotice(null)
    setCart((current) => {
      const nextQuantity = (current[productId] || 0) + 1
      const quantity = product.stock == null ? nextQuantity : Math.min(nextQuantity, product.stock)
      return { ...current, [productId]: quantity }
    })
  }

  const updateQuantity = (productId: string, quantity: number) => {
    const product = products.find((item) => item.id === productId)
    if (product?.stock != null && quantity > product.stock) {
      setCartNotice('No podés agregar más unidades de este producto.')
      quantity = product.stock
    } else {
      setCartNotice(null)
    }
    setCart((current) => {
      if (quantity <= 0) {
        const next = { ...current }
        delete next[productId]
        return next
      }
      const allowed = product?.stock == null ? quantity : Math.min(quantity, product.stock)
      return { ...current, [productId]: allowed }
    })
  }

  const removeFromCart = (productId: string) => {
    setCartNotice(null)
    setCart((current) => {
      const next = { ...current }
      delete next[productId]
      return next
    })
  }

  const clearCart = () => {
    setCart({})
    setCartNotice(null)
  }

  const cartItems = useMemo(() => products.filter((product) => cart[product.id] != null), [products, cart])
  const cartCount = Object.values(cart).reduce((sum, quantity) => sum + quantity, 0)
  const subtotal = cartItems.reduce((sum, product) => sum + product.price * cart[product.id], 0)

  const value: CartContextValue = {
    cart,
    ready,
    cartItems,
    cartCount,
    subtotal,
    cartNotice,
    addToCart,
    updateQuantity,
    removeFromCart,
    clearCart,
    clearCartNotice: () => setCartNotice(null),
  }

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext)
  if (!context) throw new Error('useCart debe usarse dentro de un CartProvider')
  return context
}
