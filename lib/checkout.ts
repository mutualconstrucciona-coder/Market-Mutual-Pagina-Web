import { MARKET_CONFIG } from '@/lib/market-config'

export type DeliveryMethod = 'pickup' | 'north' | 'south'

export type CheckoutData = {
  name: string
  phone: string
  deliveryMethod: DeliveryMethod | ''
  address: string
  reference: string
  hasAffiliation: boolean
  observations: string
}

export const EMPTY_CHECKOUT: CheckoutData = {
  name: '',
  phone: '',
  deliveryMethod: '',
  address: '',
  reference: '',
  hasAffiliation: false,
  observations: '',
}

export const DELIVERY_OPTIONS: ReadonlyArray<{
  value: DeliveryMethod
  title: string
  description: string
}> = [
  {
    value: 'pickup',
    title: 'Retiro en el local',
    description: 'Retirá tu pedido directamente en Market Mutual. Sin compra mínima.',
  },
  {
    value: 'north',
    title: 'Envío a domicilio — Zona Norte',
    description: 'Recibí tu pedido en Zona Norte. Compra mínima requerida.',
  },
  {
    value: 'south',
    title: 'Envío a domicilio — Zona Sur',
    description: 'Recibí tu pedido en Zona Sur. Compra mínima requerida.',
  },
]

export type CheckoutField = 'name' | 'phone' | 'deliveryMethod' | 'address'
export type CheckoutErrors = Partial<Record<CheckoutField, string>>

export function isHomeDelivery(method: CheckoutData['deliveryMethod']): method is 'north' | 'south' {
  return method === 'north' || method === 'south'
}

export function deliveryMethodLabel(method: DeliveryMethod): string {
  if (method === 'pickup') return 'Retiro en el local'
  return method === 'north' ? 'Envío a domicilio — Zona Norte' : 'Envío a domicilio — Zona Sur'
}

export function deliveryZoneLabel(method: DeliveryMethod): string {
  if (method === 'pickup') return 'Retiro en el local'
  return method === 'north' ? 'Norte' : 'Sur'
}

export function deliveryMinimum(method: CheckoutData['deliveryMethod']): number | null {
  if (method === 'north') return MARKET_CONFIG.deliveryMinimums.north
  if (method === 'south') return MARKET_CONFIG.deliveryMinimums.south
  return null
}

export function deliveryCost(method: CheckoutData['deliveryMethod']): number | null {
  if (method === 'north') return MARKET_CONFIG.deliveryCosts.north
  if (method === 'south') return MARKET_CONFIG.deliveryCosts.south
  return null
}

export function missingToMinimum(method: CheckoutData['deliveryMethod'], subtotal: number): number {
  const minimum = deliveryMinimum(method)
  return minimum === null ? 0 : Math.max(0, minimum - subtotal)
}

export function validateCheckout(data: CheckoutData): CheckoutErrors {
  const errors: CheckoutErrors = {}

  if (data.name.trim().split(/\s+/).filter(Boolean).length < 2) {
    errors.name = 'Ingresá tu nombre y apellido.'
  }

  const phoneDigits = data.phone.replace(/\D/g, '')
  if (!data.phone.trim()) {
    errors.phone = 'El teléfono es obligatorio.'
  } else if (phoneDigits.length < 7 || phoneDigits.length > 15) {
    errors.phone = 'Ingresá un teléfono válido.'
  }

  if (!data.deliveryMethod) {
    errors.deliveryMethod = 'Seleccioná cómo querés recibir tu pedido.'
  }

  if (isHomeDelivery(data.deliveryMethod) && !data.address.trim()) {
    errors.address = 'La dirección es obligatoria para envíos a domicilio.'
  }

  return errors
}

export function isCheckoutValid(data: CheckoutData): boolean {
  return Object.keys(validateCheckout(data)).length === 0
}

export function canSubmitCheckout(data: CheckoutData, subtotal: number, cartCount: number): boolean {
  if (cartCount <= 0 || subtotal <= 0 || !isCheckoutValid(data)) return false
  return missingToMinimum(data.deliveryMethod, subtotal) === 0
}
