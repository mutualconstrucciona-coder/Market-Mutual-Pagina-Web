import { AdminCatalog } from '@/components/admin/admin-catalog'
import { AdminLogin } from '@/components/admin/admin-login'
import { localAdminEnabled } from '@/lib/admin/catalog-repository'
import { currentMarketAdmin, supabaseConfigured } from '@/lib/supabase/server'
export const metadata = { title:'Administración | Market Mutual', robots:{index:false,follow:false} }
export const dynamic = 'force-dynamic'
export default async function AdminPage() {
  if (supabaseConfigured()) {
    const admin = await currentMarketAdmin()
    if (!admin) return <AdminLogin />
    return <AdminCatalog localMode={true} centralMode={true} />
  }
  return <AdminCatalog localMode={localAdminEnabled()} centralMode={false} />
}
