#!/usr/bin/env node
// Importación inicial no destructiva del catálogo POSBerry a Supabase.
// Ejecutar solamente después de aplicar la migración del proyecto CORRECTO.
// Credenciales privadas sólo en variables de entorno del servidor local.
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const base = process.env.SUPABASE_URL?.replace(/\/$/, '')
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
if (!base || !key) {
  console.error('Faltan SUPABASE_URL y SUPABASE_SECRET_KEY (o la clave legacy). No se modificaron datos.')
  process.exit(1)
}
const origin = new URL(base)
if (origin.protocol !== 'https:' || origin.hostname !== 'qwbiemtonvzucatlvuri.supabase.co' || origin.pathname !== '/' || origin.search || origin.hash) {
  throw new Error('SUPABASE_URL debe ser una URL HTTPS válida de proyecto Supabase.')
}
const raw = JSON.parse(await readFile(resolve('public/data/catalog-posberry.json'), 'utf8'))
const assoc = JSON.parse(await readFile(resolve('public/data/product-image-associations.json'), 'utf8'))
const local = JSON.parse(await readFile(resolve('public/data/product-image-local.json'), 'utf8'))
if (!Array.isArray(raw.products) || raw.products.length !== 753) {
  throw new Error('El catálogo local no tiene los 753 productos esperados: se canceló la importación.')
}
const approved = new Map((assoc.associations ?? [])
  .filter(a => a.status === 'approved' && a.productId && a.imageUrl)
  .map(a => [a.productId, a]))
const localImages = new Map((local.associations ?? [])
  .filter(a => a.productId && typeof a.imageUrl === 'string' && /^\/products\/[a-zA-Z0-9_-]+\.webp$/.test(a.imageUrl))
  .map(a => [a.productId, a.imageUrl]))
const products = raw.products.map(p => {
  const image = localImages.get(p.id)
  if (image) return { ...p, image, imageSource: 'local-ean', imageCreditUrl: undefined, imageLicense: undefined }
  const other = approved.get(p.id)
  if (other) return { ...p, image: other.imageUrl, imageSource: 'open-food-facts', imageCreditUrl: other.sourceProductUrl, imageLicense: assoc.license }
  return p
})
const families = [...new Set(products.map(p => p.category))].sort((a,b)=>a.localeCompare(b,'es'))
// Evitar sobrescribir cualquier trabajo ya hecho en el panel.
const isLegacyJwt = key.startsWith('eyJ') && key.split('.').length === 3
const headers = { apikey: key, ...(isLegacyJwt ? { Authorization: `Bearer ${key}` } : {}), 'Content-Type': 'application/json' }
const endpoint = `${base}/rest/v1/market_catalog_state`
const check = await fetch(`${endpoint}?select=id,revision,products&id=eq.1`, { headers })
if (!check.ok) throw new Error(`No se pudo comprobar el estado del catálogo (${check.status}): ${await check.text()}`)
const current = await check.json()
if (current.length) {
  const existing = current[0]
  if (existing.revision !== 0 || (Array.isArray(existing.products) && existing.products.length)) {
    throw new Error('Supabase ya tiene un catálogo o revisiones: no se sobreescribirá nada.')
  }
}
const result = await fetch(endpoint, {
  method: 'POST',
  headers: { ...headers, Prefer: 'resolution=merge-duplicates,return=minimal' },
  body: JSON.stringify({ id: 1, revision: 0, products, families, flyers: [] })
})
if (!result.ok) throw new Error(`La importación fue rechazada (${result.status}): ${await result.text()}`)
console.log(`Importación inicial: ${products.length} productos y ${families.length} familias. Imágenes locales: ${products.filter(p=>p.imageSource==='local-ean').length}; imágenes externas aprobadas: ${products.filter(p=>p.imageSource==='open-food-facts').length}.`)
