import { formatMoney } from '@/lib/utils'
import {
  deliveryCost,
  deliveryZoneLabel,
  isHomeDelivery,
} from '@/lib/checkout'
import type { CheckoutData } from '@/lib/checkout'
import type { Product } from '@/lib/market-data'

export type OrderLine = {
  product: Product
  quantity: number
}

export function generateOrderNumber(date: Date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const sequence = String(Math.floor(1000 + Math.random() * 9000))
  return `MM-${year}${month}${day}-${sequence}`
}

const TICKET_SEPARATOR = '━━━━━━━━━━━━━━━━'

function formatOrderDate(date: Date): string {
  const parts = new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Argentina/Buenos_Aires',
  }).formatToParts(date)
  const value = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value ?? ''
  return `${value('day')}/${value('month')}/${value('year')} · ${value('hour')}:${value('minute')}`
}

function buildProductsSection(items: OrderLine[]): string {
  const lines = items.map((line) => [
    `*${line.quantity} × ${line.product.name}*`,
    `${formatMoney(line.product.price)} c/u — ${formatMoney(line.product.price * line.quantity)}`,
  ].join('\n'))

  return [`*DETALLE DEL PEDIDO*`, TICKET_SEPARATOR, lines.join('\n\n')].join('\n')
}

export function buildWhatsAppOrderMessage(options: {
  orderNumber: string
  data: CheckoutData
  items: OrderLine[]
  subtotal: number
  date?: Date
}): string {
  const { orderNumber, data, items, subtotal, date = new Date() } = options
  if (!data.deliveryMethod) throw new Error('No se puede generar el pedido sin modalidad de entrega.')

  const dateAndTime = formatOrderDate(date)
  const cost = deliveryCost(data.deliveryMethod)
  const homeDelivery = isHomeDelivery(data.deliveryMethod)
  const deliveryLines = homeDelivery ? [
    '*ENTREGA*',
    'Envío a domicilio',
    `Zona ${deliveryZoneLabel(data.deliveryMethod)}`,
    `Dirección: ${data.address.trim()}`,
    data.reference.trim() ? `Referencia: ${data.reference.trim()}` : null,
  ].filter((line): line is string => Boolean(line)) : [
    '*ENTREGA*',
    'Retiro en el local',
  ]

  const total = subtotal + (cost ?? 0)
  const totalLines = [
    cost !== null ? `Costo de envío: ${formatMoney(cost)}` : null,
    `*TOTAL: ${formatMoney(total)}*`,
  ].filter((line): line is string => Boolean(line))

  return [
    '*MARKET MUTUAL*',
    '*COMPROBANTE DE PEDIDO*',
    TICKET_SEPARATOR,
    `*N.º ${orderNumber}*`,
    dateAndTime,
    '',
    '*CLIENTE*',
    data.name.trim(),
    `Tel: ${data.phone.trim()}`,
    ...(data.hasAffiliation ? ['', '🔵 *Afiliación declarada: sí*', 'Verificar vía WhatsApp'] : []),
    '',
    ...deliveryLines,
    '',
    buildProductsSection(items),
    TICKET_SEPARATOR,
    ...totalLines,
    ...(data.observations.trim() ? ['', '*OBSERVACIONES*', data.observations.trim()] : []),
    '',
    '*Pedido pendiente de confirmación. El pago se coordina con Market Mutual.*',
  ].join('\n')
}

export function buildWhatsAppUrl(whatsappNumber: string, message: string): string {
  const number = whatsappNumber.replace(/\D/g, '')
  if (!number) throw new Error('Falta configurar el número oficial de WhatsApp de Market Mutual.')
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`
}
