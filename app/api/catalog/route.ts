import { catalogRepository } from '@/lib/admin/catalog-repository'

// Reservamos las últimas tres unidades para la venta presencial.
const MINIMUM_RESERVED_STOCK = 3
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
          (p) => p.available && p.stock != null && p.stock > MINIMUM_RESERVED_STOCK,
        ).map(p => ({ ...p, stock: 999999 })),
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
