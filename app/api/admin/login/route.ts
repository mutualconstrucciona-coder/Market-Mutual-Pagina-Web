import { NextResponse } from 'next/server'
import {
  assertSameOrigin,
  baseUrl,
  publishableApiHeaders,
  publishableKey,
  supabaseConfigured,
  supabaseService,
} from '@/lib/supabase/server'
export const runtime = 'nodejs'
export async function POST(request: Request) {
  try {
    assertSameOrigin(request)
    if (!supabaseConfigured()) return Response.json({error:'Supabase no está configurado.'},{status:503})
    const body = await request.json() as {email?:string,password?:string}
    if (typeof body.email !== 'string' || typeof body.password !== 'string' || !body.email.includes('@') || body.password.length>200)
      return Response.json({error:'Ingresá correo y contraseña válidos.'},{status:400})
    const tokenResponse = await fetch(baseUrl() + '/auth/v1/token?grant_type=password', {
      method:'POST', headers:{...publishableApiHeaders(publishableKey()), 'Content-Type':'application/json'},
      body:JSON.stringify({email:body.email,password:body.password}), cache:'no-store',
    })
    if (!tokenResponse.ok) return Response.json({error:'Credenciales incorrectas o cuenta no confirmada.'},{status:401})
    const session = await tokenResponse.json() as {access_token:string,expires_in:number,user:{id:string}}
    const isAdmin = await supabaseService('/rest/v1/market_admin_users?select=user_id&user_id=eq.'+encodeURIComponent(session.user.id)+'&limit=1')
    if (!isAdmin.ok || !(await isAdmin.json() as unknown[]).length)
      return Response.json({error:'Esta cuenta no tiene permiso de administración.'},{status:403})
    const result = NextResponse.json({ok:true})
    result.cookies.set('market_admin_access', session.access_token, {
      httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',
      maxAge:Math.min(Math.max(session.expires_in, 1),3600),
    })
    return result
  } catch {
    return Response.json({error:'No se pudo iniciar sesión.'},{status:400})
  }
}
