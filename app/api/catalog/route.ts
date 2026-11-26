import { catalogRepository } from '@/lib/admin/catalog-repository'
import { hasOnlineStock } from '@/lib/inventory'
import { isApprovedProductImage } from '@/lib/product-images'
import providedImageManifest from '@/public/data/product-image-provided.json'

const providedImages: Readonly<Record<string, string | undefined>> = providedImageManifest

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET() {
  try {
    const snapshot = await catalogRepository().read()
    // Hide precise inventory in the public API. Checkout via WhatsApp remains
    // subject to staff confirmation; this is not authoritative stock validation.
    return Response.json(
      {
        revision: snapshot.revision,
        products: snapshot.products.filter(
          (p) => p.available && hasOnlineStock(p.stock),
        ).map((product) => {
          const providedImage = providedImages[product.id]
          if (providedImage && !isApprovedProductImage(product)) {
            return { ...product, image: providedImage, imageSource: 'local-ean', stock: 999999 }
          }
          return { ...product, stock: 999999 }
        }),
        families: snapshot.families,
        flyers: snapshot.flyers ?? [],
      },
      { headers: { 'Cache-Control': 'no-store' } },
    )
  } catch {
    return Response.json(
      { error: 'No pudimos cargar el catálogo. Volvé a intentarlo.' },
      { status: 503 },
    )
  }
}
