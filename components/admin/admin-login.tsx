'use client'
import { useState } from 'react'
export function AdminLogin() {
  const [email,setEmail] = useState('')
  const [password,setPassword] = useState('')
  const [loading,setLoading] = useState(false)
  const [error,setError] = useState('')
  return (
    <main className="min-h-screen bg-[#f4f9fe] flex items-center justify-center px-4">
      <form className="w-full max-w-md rounded-2xl bg-white shadow-lg p-8 space-y-5"
        onSubmit={async e=>{
          e.preventDefault();setLoading(true);setError('')
          try {
            const response=await fetch('/api/admin/login',{method:'POST',headers:{'Content-Type':'application/json'},
              body:JSON.stringify({email,password})})
            const result=await response.json()
            if (!response.ok) throw new Error(result.error || 'No se pudo ingresar.')
            window.location.assign('/admin')
          } catch (caught) {setError(caught instanceof Error?caught.message:'Error inesperado')}
          finally {setLoading(false)}
        }}>
        <a href="/" className="text-sm text-blue-700 underline">Volver a la tienda</a>
        <h1 className="text-2xl font-bold text-[#12243b]">Market Mutual · Administración</h1>
        <p className="text-sm text-slate-600">Ingresá con una cuenta autorizada para administrar el catálogo.</p>
        <label className="block text-sm font-medium">Correo electrónico
          <input required type="email" autoComplete="username" value={email} onChange={e=>setEmail(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3" />
        </label>
        <label className="block text-sm font-medium">Contraseña
          <input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}
            className="mt-1 w-full rounded-lg border p-3" />
        </label>
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        <button disabled={loading} className="w-full rounded-lg bg-blue-700 text-white p-3 font-semibold disabled:opacity-50">
          {loading?'Verificando…':'Ingresar al panel'}
        </button>
      </form>
    </main>
  )
}
