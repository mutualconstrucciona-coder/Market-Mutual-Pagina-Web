'use client'

import { useMemo, useRef, useState } from 'react'
import { MapPin, Store, Truck } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useCart } from '@/components/market/cart-store'
import { OrderSummary } from '@/components/market/order-summary'
import {
  canSubmitCheckout,
  DELIVERY_OPTIONS,
  deliveryMinimum,
  deliveryZoneLabel,
  EMPTY_CHECKOUT,
  isHomeDelivery,
  missingToMinimum,
  validateCheckout,
} from '@/lib/checkout'
import type { CheckoutData, CheckoutErrors, CheckoutField, DeliveryMethod } from '@/lib/checkout'
import { MARKET_CONFIG } from '@/lib/market-config'
import { buildWhatsAppOrderMessage, buildWhatsAppUrl, generateOrderNumber } from '@/lib/order'
import { formatMoney } from '@/lib/utils'

const inputClass =
  'h-12 min-w-0 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-[#16385f] outline-none transition placeholder:text-slate-400 focus:border-[#1456a0] focus:ring-2 focus:ring-[#1456a0]/20'

const labelClass = 'text-sm font-semibold text-[#12355f]'

const deliveryIcons = {
  pickup: Store,
  north: Truck,
  south: MapPin,
} satisfies Record<DeliveryMethod, typeof Store>

export function CheckoutForm() {
  const { cart, cartItems, cartCount, subtotal } = useCart()
  const [data, setData] = useState<CheckoutData>(EMPTY_CHECKOUT)
  const [errors, setErrors] = useState<CheckoutErrors>({})
  const [touched, setTouched] = useState<Partial<Record<CheckoutField, boolean>>>({})
  const [submitMessage, setSubmitMessage] = useState('')
  const orderNumber = useRef<string | null>(null)

  const currentErrors = useMemo(() => validateCheckout(data), [data])
  const minimum = deliveryMinimum(data.deliveryMethod)
  const amountMissing = missingToMinimum(data.deliveryMethod, subtotal)
  const belowMinimum = minimum !== null && amountMissing > 0
  const canSubmit = canSubmitCheckout(data, subtotal, cartCount)

  const visibleError = (field: CheckoutField) => errors[field] ?? (touched[field] ? currentErrors[field] : undefined)

  const setField = <K extends keyof CheckoutData>(field: K, value: CheckoutData[K]) => {
    setData((current) => ({ ...current, [field]: value }))
    setSubmitMessage('')
    if (field in errors) {
      setErrors((current) => {
        const next = { ...current }
        delete next[field as CheckoutField]
        return next
      })
    }
  }

  const markTouched = (field: CheckoutField) => {
    setTouched((current) => ({ ...current, [field]: true }))
  }

  const selectDelivery = (deliveryMethod: DeliveryMethod) => {
    setData((current) => ({
      ...current,
      deliveryMethod,
      address: deliveryMethod === 'pickup' ? '' : current.address,
      reference: deliveryMethod === 'pickup' ? '' : current.reference,
    }))
    setTouched((current) => ({ ...current, deliveryMethod: true }))
    setErrors((current) => {
      const next = { ...current }
      delete next.deliveryMethod
      delete next.address
      return next
    })
    setSubmitMessage('')
  }

  const handleSend = () => {
    const nextErrors = validateCheckout(data)
    setErrors(nextErrors)
    setTouched({ name: true, phone: true, deliveryMethod: true, address: true })

    if (Object.keys(nextErrors).length > 0 || !canSubmitCheckout(data, subtotal, cartCount)) {
      setSubmitMessage(belowMinimum
        ? 'El pedido todavía no alcanza el mínimo requerido para esta zona.'
        : 'Revisá los datos obligatorios antes de continuar.')
      return
    }

    const whatsappNumber = MARKET_CONFIG.whatsappNumber.replace(/\D/g, '')
    if (!whatsappNumber) {
      setSubmitMessage('Falta configurar el número oficial de WhatsApp de Market Mutual.')
      return
    }

    if (!orderNumber.current) orderNumber.current = generateOrderNumber()
    const items = cartItems.map((product) => ({ product, quantity: cart[product.id] }))
    const message = buildWhatsAppOrderMessage({
      orderNumber: orderNumber.current,
      data,
      items,
      subtotal,
    })
    const url = buildWhatsAppUrl(whatsappNumber, message)
    window.open(url, '_blank', 'noopener,noreferrer')
    setSubmitMessage('WhatsApp se abrió en una nueva pestaña. Tu carrito permanece guardado.')
  }

  return (
    <section className="min-w-0 rounded-3xl border border-[#dce8f3] bg-white p-4 shadow-[0_18px_55px_rgba(18,53,95,0.07)] sm:p-7">
      <div className="mb-7">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2581d2]">Finalizá tu pedido</p>
        <h1 className="mt-2 text-2xl font-black tracking-tight text-[#12355f]">Datos de contacto y entrega</h1>
        <p className="mt-2 text-sm leading-6 text-slate-500">Completá tus datos. El pago y la disponibilidad se coordinan con Market Mutual por WhatsApp.</p>
      </div>

      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="checkout-name" className={labelClass}>Nombre y apellido <span className="text-red-600">*</span></label>
          <input id="checkout-name" value={data.name} onChange={(event) => setField('name', event.target.value)} onBlur={() => markTouched('name')} className={inputClass} placeholder="Juan Pérez" autoComplete="name" aria-invalid={Boolean(visibleError('name'))} />
          {visibleError('name') && <p className="text-xs font-medium text-red-600">{visibleError('name')}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="checkout-phone" className={labelClass}>Teléfono <span className="text-red-600">*</span></label>
          <input id="checkout-phone" value={data.phone} onChange={(event) => setField('phone', event.target.value)} onBlur={() => markTouched('phone')} className={inputClass} placeholder="297 412 3456" type="tel" inputMode="tel" autoComplete="tel" aria-invalid={Boolean(visibleError('phone'))} />
          {visibleError('phone') && <p className="text-xs font-medium text-red-600">{visibleError('phone')}</p>}
        </div>

        <fieldset className="flex min-w-0 flex-col gap-2.5">
          <legend className={labelClass}>Modalidad de entrega <span className="text-red-600">*</span></legend>
          <div className="grid grid-cols-1 gap-3">
            {DELIVERY_OPTIONS.map((option) => {
              const Icon = deliveryIcons[option.value]
              const selected = data.deliveryMethod === option.value
              return (
                <label key={option.value} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selected ? 'border-[#2581d2] bg-[#edf6fe] ring-2 ring-[#2581d2]/15' : 'border-slate-200 hover:border-[#9fc7e9] hover:bg-[#f8fbfe]'}`}>
                  <input type="radio" name="deliveryMethod" value={option.value} checked={selected} onChange={() => selectDelivery(option.value)} className="sr-only" />
                  <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${selected ? 'bg-[#1456a0] text-white' : 'bg-[#eaf3fb] text-[#1456a0]'}`}><Icon className="size-5" aria-hidden="true" /></span>
                  <span className="min-w-0 break-words"><strong className="block text-sm text-[#12355f]">{option.title}</strong><span className="mt-1 block text-xs leading-5 text-slate-500">{option.description}</span></span>
                </label>
              )
            })}
          </div>
          {visibleError('deliveryMethod') && <p className="text-xs font-medium text-red-600">{visibleError('deliveryMethod')}</p>}
        </fieldset>

        {isHomeDelivery(data.deliveryMethod) && (
          <>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkout-address" className={labelClass}>Dirección (calle y número) <span className="text-red-600">*</span></label>
              <input id="checkout-address" value={data.address} onChange={(event) => setField('address', event.target.value)} onBlur={() => markTouched('address')} className={inputClass} placeholder="Calle y número" autoComplete="street-address" aria-invalid={Boolean(visibleError('address'))} />
              {visibleError('address') && <p className="text-xs font-medium text-red-600">{visibleError('address')}</p>}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="checkout-reference" className={labelClass}>Referencia del domicilio <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
              <input id="checkout-reference" value={data.reference} onChange={(event) => setField('reference', event.target.value)} className={inputClass} placeholder="Ej. casa con portón negro" />
            </div>
          </>
        )}

        {data.deliveryMethod === 'pickup' && (
          <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800" role="status">
            <strong>Sin compra mínima.</strong> Podés retirar tu pedido directamente en Market Mutual.
          </div>
        )}

        {isHomeDelivery(data.deliveryMethod) && minimum !== null && (
          <div className={`rounded-2xl border px-4 py-3 text-sm ${belowMinimum ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`} role="status" aria-live="polite">
            {belowMinimum ? (
              <p>Para envíos a Zona {deliveryZoneLabel(data.deliveryMethod)} necesitás una compra mínima de <strong>{formatMoney(minimum)}</strong>. Te faltan <strong>{formatMoney(amountMissing)}</strong> para completar tu pedido.</p>
            ) : (
              <p><strong>Ya alcanzaste la compra mínima de {formatMoney(minimum)}</strong> para Zona {deliveryZoneLabel(data.deliveryMethod)}.</p>
            )}
          </div>
        )}

        <div className="rounded-2xl border border-[#dce8f3] bg-[#f3f8fd]">
          <label className="flex min-h-12 cursor-pointer items-center gap-3 px-4 py-3">
            <input
              type="checkbox"
              checked={data.hasAffiliation}
              onChange={(event) => setField('hasAffiliation', event.target.checked)}
              aria-describedby={data.hasAffiliation ? 'checkout-affiliation-notice' : undefined}
              className="size-5 shrink-0 accent-[#1456a0] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1456a0]"
            />
            <span className={labelClass}>Cuento con afiliación</span>
          </label>
          <div role="status">
            {data.hasAffiliation && (
              <p id="checkout-affiliation-notice" className="px-4 pb-3 text-sm leading-5 text-[#315579]">
                Los beneficios correspondientes se verificarán al confirmar el pedido por WhatsApp.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="checkout-observations" className={labelClass}>Observaciones del pedido <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
          <textarea id="checkout-observations" value={data.observations} onChange={(event) => setField('observations', event.target.value)} className="min-h-24 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-[#16385f] outline-none transition placeholder:text-slate-400 focus:border-[#1456a0] focus:ring-2 focus:ring-[#1456a0]/20" placeholder="Algún detalle sobre tu pedido..." rows={4} />
        </div>

        {!MARKET_CONFIG.whatsappNumber && (
          <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800">Pendiente: configurar el número oficial de WhatsApp de Market Mutual.</p>
        )}

        <OrderSummary className="lg:hidden" />

        <Button
          className="h-auto min-h-13 w-full gap-2.5 whitespace-normal rounded-xl bg-[#1026ed] px-3 py-3 text-xs font-bold tracking-widest text-white hover:bg-[#0b1ebd] focus-visible:ring-[#1026ed]/40 motion-reduce:transition-none disabled:bg-[#e4ebf2] disabled:text-[#516b87] disabled:opacity-100 sm:px-6"
          disabled={!canSubmit}
          onClick={handleSend}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" className="size-5" aria-hidden="true">
            <path d="M5 18.8 3.5 21l.8-4.4a8.7 8.7 0 1 1 3 3.1Z" />
            <path d="M9.4 7.8c-.8-.4-1.7.7-1.6 1.6.3 2.8 3.8 6.1 6.4 6.5 1 .2 2.1-.9 1.8-1.7l-1.8-1.1c-.4-.2-.7.2-1.1.7a7 7 0 0 1-3.4-3.2c.4-.4.8-.7.6-1.1Z" />
          </svg>
          <span className="uppercase">Pedir por WhatsApp</span>
        </Button>

        <p className="text-center text-xs leading-5 text-slate-400">El carrito no se vacía al abrir WhatsApp. El pedido queda sujeto a confirmación de disponibilidad.</p>
        {submitMessage && <p className="text-center text-sm font-semibold text-[#9a6200]" role="status" aria-live="polite">{submitMessage}</p>}
      </div>
    </section>
  )
}
