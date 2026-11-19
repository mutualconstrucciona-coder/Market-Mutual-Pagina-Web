import { NextResponse } from 'next/server'
import { assertSameOrigin } from '@/lib/supabase/server'
export async function POST(request:Request) {
  try { assertSameOrigin(request) } catch {return Response.json({error:'Origen no autorizado'},{status:403})}
  const result = NextResponse.json({ok:true})
  result.cookies.set('market_admin_access','',{httpOnly:true,path:'/',maxAge:0})
  return result
}
