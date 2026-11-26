import { AdminCatalog } from '@/components/admin/admin-catalog'
import { AdminLogin } from '@/components/admin/admin-login'
import { localAdminEnabled } from '@/lib/admin/catalog-repository'
import { currentMarketAdmin, supabaseConfigured, supabaseService } from '@/lib/supabase/server'
export const metadata = { title:'Administración | Market Mutual', robots:{index:false,follow:false} }
export const dynamic = 'force-dynamic'
export default async function AdminPage() {
  if (supabaseConfigured()) {
    const admin = await currentMarketAdmin()
    if (!admin) return <AdminLogin />
    const sharedImagesAvailable = await supabaseService('/storage/v1/bucket/market-product-images')
      .then(async (response) => response.ok && (await response.json()).public === true)
      .catch(() => false)
    return <AdminCatalog localMode={true} centralMode={true} sharedImagesAvailable={sharedImagesAvailable} />
  }
  return <AdminCatalog localMode={localAdminEnabled()} centralMode={false} />
}
