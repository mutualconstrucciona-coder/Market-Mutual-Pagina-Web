'use client'

/* eslint-disable @next/next/no-img-element */
import { memo, useState } from 'react'
import { Plus } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatMoney } from '@/lib/utils'
import type { Product } from '@/lib/market-data'
import { isApprovedProductImage } from '@/lib/product-images'

type ProductCardProps = {
  product: Product
  onAdd: (product: Product) => void
  variant?: 'default' | 'offer'
}

export const ProductCard = memo(function ProductCard({ product, onAdd, variant = 'default' }: ProductCardProps) {
  const isOffer = variant === 'offer'
  const imageIsDisplayable = isApprovedProductImage(product) || product.demo === true
  const imageSource = imageIsDisplayable ? product.image || '/placeholder-product.svg' : '/placeholder-product.svg'
  const [imageFallback, setImageFallback] = useState<{ source: string; url: string } | null>(null)
  const image = imageFallback?.source === imageSource ? imageFallback.url : imageSource

  return (
    <article className={`group flex min-w-0 flex-col rounded-[22px] border bg-white p-2 shadow-[0_10px_28px_rgba(18,53,95,0.07)] transition duration-300 hover:-translate-y-1 hover:shadow-[0_18px_38px_rgba(18,53,95,0.13)] sm:p-2.5 ${isOffer ? 'border-[#79b9eb] ring-1 ring-[#2581d2]/10' : 'border-[#e1ebf4]'}`}>
      <div className="relative overflow-hidden rounded-[17px] bg-white">
        <img src={image} alt={imageIsDisplayable ? product.name : `Imagen no disponible para ${product.name}`} onError={() => setImageFallback({ source: imageSource, url: '/placeholder-product.svg' })} loading="lazy" decoding="async" className="aspect-square w-full bg-white object-contain object-center p-2.5 transition duration-500 group-hover:scale-[1.03]" />
        {product.discount && <span className="absolute left-2 top-2 rounded-md bg-[#ee6b4d] px-2 py-1 text-[10px] font-bold text-white">{product.discount}</span>}
      </div>
      {product.imageSource === 'open-food-facts' && product.imageCreditUrl && (
        <div className="mt-1 px-1 text-[10px] text-slate-500">
          <a href={product.imageCreditUrl} target="_blank" rel="noreferrer" className="underline">
            Foto: Open Food Facts
          </a>
          {' · '}
          <a
            href="https://creativecommons.org/licenses/by-sa/3.0/"
            target="_blank"
            rel="license noreferrer"
            className="underline"
          >
            {product.imageLicense}
          </a>
        </div>
      )}
      <div className="flex flex-1 flex-col px-1 pb-1 pt-2.5">
        <p className="truncate text-[9px] font-bold uppercase tracking-[0.09em] text-[#7990a8] sm:text-[10px]">{product.category}</p>
        <h3 className="mt-1 min-h-10 line-clamp-2 text-[13px] font-extrabold leading-[1.15rem] text-[#16385f] sm:text-sm">{product.name}</h3>
        <div className="mt-auto flex items-end justify-between gap-2 pt-3">
          <div className="min-w-0"><p className="truncate text-base font-extrabold tracking-tight text-[#12355f] sm:text-lg">{formatMoney(product.price)}</p>{product.oldPrice && <p className="text-[10px] text-slate-400 line-through sm:text-xs">{formatMoney(product.oldPrice)}</p>}</div>
          <Button onClick={() => onAdd(product)} disabled={!product.available} size="sm" className="size-9 shrink-0 rounded-full bg-[#1456a0] p-0 text-white shadow-[0_8px_18px_rgba(20,86,160,0.25)] hover:bg-[#0e4787] sm:size-10" aria-label={`Agregar ${product.name}`}><Plus className="size-4" /></Button>
        </div>
      </div>
    </article>
  )
})
