'use client'
/* eslint-disable @next/next/no-img-element */
import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ImageOff,
  Package,
  Pencil,
  Percent,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldAlert,
  Star,
  X,
} from 'lucide-react'
import { BrandLogo } from '@/components/market/brand-logo'
import { useCatalog } from '@/components/market/catalog-store'
import { isApprovedProductImage } from '@/lib/product-images'
import type { Product } from '@/lib/market-data'
import {
  CatalogError,
  parsePriceInput,
  validPrice,
} from '@/lib/admin/catalog-rules'
import type {
  CatalogCommand,
  CatalogSnapshot,
  ProductDraft,
} from '@/lib/admin/catalog-rules'
import { formatMoney } from '@/lib/utils'
import { ProductEditor } from './product-editor'
import { PriceAdjustment } from './price-adjustment'
import { FlyerManager } from './flyer-manager'
import { featuredFlyers } from '@/lib/featured-flyers'
import styles from './admin.module.css'

type Tab = 'products' | 'featured' | 'configuration'
const PAGE_SIZE = 25
const EMPTY_PRODUCTS: Product[] = []
const normalize = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
const hasImage = (p: Product) => isApprovedProductImage(p)

function ProductPhoto({ product }: { product: Product }) {
  const [failed, setFailed] = useState(false)
  if (!hasImage(product) || failed)
    return (
      <span
        className={`${styles.photo} inline-flex items-center justify-center text-slate-400`}
        role="img"
        aria-label={`Sin imagen: ${product.name}`}
      >
        <ImageOff size={21} />
      </span>
    )
  return (
    <img
      className={styles.photo}
      src={product.image}
      alt={product.name}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  )
}

export function AdminCatalog({ localMode, centralMode = false }: { localMode: boolean; centralMode?: boolean }) {
  const { refreshCatalog } = useCatalog()
  const [snapshot, setSnapshot] = useState<CatalogSnapshot | null>(null)
  const [tab, setTab] = useState<Tab>('products')
  const [query, setQuery] = useState('')
  const [family, setFamily] = useState('')
  const [filter, setFilter] = useState('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<string[]>([])
  const [editor, setEditor] = useState<Product | null | undefined>(undefined)
  const [adjustment, setAdjustment] = useState(false)
  const [formDirty, setFormDirty] = useState(false)
  const [quickPrice, setQuickPrice] = useState<{
    id: string
    value: string
  } | null>(null)
  const [order, setOrder] = useState<string[] | null>(null)
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(localMode)
  const dirty = formDirty || Boolean(quickPrice) || Boolean(order)
  const products = snapshot?.products ?? EMPTY_PRODUCTS
  const families = snapshot?.families ?? []

  useEffect(() => {
    if (!dirty) return
    const unload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    const link = (event: MouseEvent) => {
      const anchor = (event.target as Element).closest?.('a[href]')
      if (
        anchor &&
        !window.confirm(
          'Tenés cambios sin guardar. ¿Querés salir y descartarlos?',
        )
      ) {
        event.preventDefault()
        event.stopPropagation()
      }
    }
    window.addEventListener('beforeunload', unload)
    document.addEventListener('click', link, true)
    return () => {
      window.removeEventListener('beforeunload', unload)
      document.removeEventListener('click', link, true)
    }
  }, [dirty])
  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/catalog', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setSnapshot(result)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No pudimos cargar los productos.',
      )
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => {
    // Synchronize with the server; loading feedback is initialized before the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (localMode) void load()
  }, [load, localMode])
  const discard = () =>
    !dirty || window.confirm('Tenés cambios sin guardar. ¿Querés descartarlos?')
  const closeModal = () => {
    if (discard()) {
      setEditor(undefined)
      setAdjustment(false)
      setFormDirty(false)
    }
  }
  const mutate = async (command: CatalogCommand, message: string) => {
    if (!snapshot) throw new Error('Cargá el catálogo antes de guardar.')
    setBusy(true)
    setError('')
    setNotice('')
    try {
      const response = await fetch('/api/admin/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ revision: snapshot.revision, command }),
      })
      const result = await response.json()
      if (!response.ok)
        throw new CatalogError(
          result.error || 'No se pudo guardar.',
          response.status,
          result.fields,
        )
      setSnapshot(result)
      setNotice(message)
      window.dispatchEvent(new Event('catalog-updated'))
      // A shop refresh failure must never misreport a successful write as failed.
      void refreshCatalog().catch(() => {})
      return result as CatalogSnapshot
    } finally {
      setBusy(false)
    }
  }
  const quickAction = async (command: CatalogCommand, message: string) => {
    try {
      await mutate(command, message)
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'No se pudo guardar el cambio.',
      )
    }
  }
  const saveProduct = async (draft: ProductDraft, image?: Blob) => {
    // Client validation catches price errors before an unnecessary upload.
    if (!validPrice(draft.price))
      throw new CatalogError('Revisá el precio antes de guardar.', 422, {
        price: 'Ingresá un precio mayor a cero, con hasta dos decimales.',
      })
    if (image) {
      const form = new FormData()
      form.append('image', image, 'producto.webp')
      const response = await fetch('/api/admin/images', {
        method: 'POST',
        body: form,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      draft = { ...draft, image: result.imageUrl }
    }
    await mutate(
      { type: 'save', product: draft },
      editor
        ? 'Producto actualizado. El cambio ya está disponible en la tienda.'
        : 'Producto creado. Se mostrará en la tienda si está activo y tiene stock.',
    )
    setEditor(undefined)
    setFormDirty(false)
  }
  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          (!family || p.category === family) &&
          (!query ||
            normalize(
              [p.name, p.sku, p.barcode, p.category].join(' '),
            ).includes(normalize(query))) &&
          (filter !== 'active' || p.available) &&
          (filter !== 'inactive' || !p.available) &&
          (filter !== 'featured' || p.featured) &&
          (filter !== 'no-image' || !hasImage(p)),
      ),
    [products, family, query, filter],
  )
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(
    currentPage * PAGE_SIZE,
    (currentPage + 1) * PAGE_SIZE,
  )
  const featured = products
    .filter((p) => p.featured)
    .sort((a, b) => (a.featuredOrder ?? 0) - (b.featuredOrder ?? 0))
  const ordered = order
    ? order.map((id) => products.find((p) => p.id === id)!).filter(Boolean)
    : featured
  const selectProduct = (id: string) =>
    setSelected((current) =>
      current.includes(id)
        ? current.filter((value) => value !== id)
        : [...current, id],
    )
  const allSelected =
    visible.length > 0 && visible.every((p) => selected.includes(p.id))
  const disabled = busy || loading || !localMode || !snapshot
  const priceControl = (p: Product) =>
    quickPrice?.id === p.id ? (
      <form
        className={styles.quickPrice}
        onSubmit={async (e) => {
          e.preventDefault()
          try {
            const price = parsePriceInput(quickPrice.value)
            await mutate(
              { type: 'prices', changes: [{ id: p.id, price }] },
              `Precio de ${p.name} actualizado.`,
            )
            setQuickPrice(null)
          } catch (caught) {
            setError(
              caught instanceof Error ? caught.message : 'Revisá el precio.',
            )
          }
        }}
      >
        <input
          aria-label={`Nuevo precio de ${p.name}`}
          inputMode="decimal"
          autoFocus
          value={quickPrice.value}
          onChange={(e) => setQuickPrice({ id: p.id, value: e.target.value })}
        />
        <button
          className={styles.iconButton}
          disabled={busy}
          aria-label="Guardar precio"
        >
          <Check size={16} />
        </button>
        <button
          className={styles.iconButton}
          type="button"
          aria-label="Cancelar precio"
          onClick={() => setQuickPrice(null)}
        >
          <X size={16} />
        </button>
      </form>
    ) : (
      <button
        className={styles.priceButton}
        disabled={disabled}
        aria-label={`Cambiar precio de ${p.name}: ${formatMoney(p.price)}`}
        onClick={() => {
          if (discard()) {
            setOrder(null)
            setQuickPrice({ id: p.id, value: String(p.price) })
          }
        }}
      >
        {formatMoney(p.price)}
        <Pencil />
      </button>
    )
  const starControl = (p: Product) => (
    <button
      className={styles.star}
      type="button"
      disabled={disabled || dirty}
      aria-pressed={p.featured === true}
      aria-label={`${p.featured ? 'Quitar de' : 'Marcar como'} destacado: ${p.name}`}
      onClick={() =>
        void quickAction(
          { type: 'flags', id: p.id, featured: !p.featured },
          p.featured
            ? 'Producto quitado de destacados.'
            : 'Producto agregado a destacados.',
        )
      }
    >
      <Star />
    </button>
  )
  const stateControl = (p: Product) => (
    <button
      className={styles.statusButton}
      disabled={disabled || dirty}
      aria-label={`${p.available ? 'Desactivar' : 'Activar'} ${p.name}`}
      onClick={() => {
        if (
          p.available &&
          !window.confirm(
            `¿Desactivar ${p.name}? Se ocultará de la tienda y sus datos se conservarán.`,
          )
        )
          return
        void quickAction(
          { type: 'flags', id: p.id, available: !p.available },
          p.available
            ? 'Producto desactivado. Sus datos se conservan.'
            : 'Producto activado. Se mostrará cuando tenga stock.',
        )
      }}
    >
      <span
        className={`${styles.badge} ${p.available ? styles.active : styles.inactive}`}
      >
        {p.available ? 'Activo' : 'Inactivo'}
      </span>
    </button>
  )
  const edit = (p: Product) => {
    if (discard()) {
      setQuickPrice(null)
      setOrder(null)
      setEditor(p)
    }
  }

  return (
    <main className={styles.shell}>
      <a href="#admin-content" className="sr-only focus:not-sr-only">
        Ir al catálogo
      </a>
      <aside className={styles.sidebar}>
        <Link
          href="/"
          className={styles.logo}
          aria-label="Volver a Market Mutual"
        >
          <BrandLogo />
        </Link>
        <h2>Administración del mercado</h2>
        <nav className={styles.nav} aria-label="Administración">
          {(
            [
              { id: 'products', label: 'Productos', Icon: Package },
              { id: 'featured', label: 'Destacados', Icon: Star },
              { id: 'configuration', label: 'Configuración', Icon: Settings2 },
            ] as const
          ).map((item) => (
            <button
              key={item.id}
              aria-current={tab === item.id ? 'page' : undefined}
              onClick={() => {
                if (discard()) {
                  setTab(item.id)
                  setQuickPrice(null)
                  setOrder(null)
                }
              }}
            >
              <item.Icon />
              {item.label}
            </button>
          ))}
        </nav>
        <div className={styles.connection}>
          <strong>
            <span className={styles.dot} />
            {centralMode ? 'Conexión central activa' : 'Sin conexión central'}
          </strong>
          {centralMode ? 'Catálogo central · Supabase' : 'Pruebas en esta PC.'}
          <br />
          {centralMode ? 'Acceso autorizado' : 'Acceso del personal pendiente.'}
        </div>
      </aside>
      <div className={styles.main} id="admin-content">
        <div className={styles.topbar}>
          <span>Market Mutual / Administración</span>
          {centralMode && <button className={styles.storeLink} type="button" onClick={async () => { await fetch('/api/admin/logout', {method:'POST'}); window.location.assign('/admin') }}>Cerrar sesión</button>}
          <a
            className={styles.storeLink}
            href="/"
            target="_blank"
            rel="noreferrer"
          >
            Ver tienda
            <ExternalLink size={16} />
          </a>
        </div>
        <div className={styles.banner}>
          <ShieldAlert />
          <span>
            <strong>
              {centralMode ? 'Panel conectado a Supabase.' : localMode
                ? 'Modo de prueba en esta PC.'
                : 'Panel online sin habilitar.'}
            </strong>{' '}
            {centralMode ? 'Los cambios se guardan en el catálogo central.' : localMode
              ? 'Los cambios se guardan en este servidor local; no se comparten entre computadoras.'
              : 'Falta configurar base de datos y usuarios autorizados.'}
          </span>
          <button
            onClick={() => {
              if (discard()) setTab('configuration')
            }}
          >
            Ver configuración
          </button>
        </div>
        <div className={styles.titlebar}>
          <div>
            <h1>
              {tab === 'products'
                ? 'Productos'
                : tab === 'featured'
                  ? 'Destacados del inicio'
                  : 'Preparar el acceso del personal'}
            </h1>
            <p>
              {tab === 'products'
                ? 'Tu catálogo, ordenado y al día.'
                : tab === 'featured'
                  ? 'Administrá hasta 5 flyers del carrusel del inicio.'
                  : 'La integración online todavía no está configurada.'}
            </p>
          </div>
          {tab === 'products' && (
            <div className={styles.actions}>
              <button
                className={styles.button}
                disabled={disabled}
                onClick={() => {
                  if (discard()) {
                    setQuickPrice(null)
                    setOrder(null)
                    setAdjustment(true)
                  }
                }}
              >
                <Percent />
                Ajustar precios
              </button>
              <button
                className={styles.primary}
                disabled={disabled}
                onClick={() => {
                  if (discard()) {
                    setQuickPrice(null)
                    setOrder(null)
                    setEditor(null)
                  }
                }}
              >
                <Plus />
                Nuevo producto
              </button>
            </div>
          )}
        </div>
        {notice && (
          <div className={styles.notice} role="status">
            <CheckCircle2 />
            <span>{notice}</span>
            <button
              className="ml-auto"
              aria-label="Cerrar confirmación"
              onClick={() => setNotice('')}
            >
              <X size={18} />
            </button>
          </div>
        )}
        {error && (
          <div className={`${styles.notice} ${styles.error}`} role="alert">
            <ShieldAlert />
            <span>{error}</span>
            <button
              className="ml-auto underline"
              onClick={() => {
                if (discard()) {
                  setEditor(undefined)
                  setAdjustment(false)
                  setFormDirty(false)
                  setQuickPrice(null)
                  setOrder(null)
                  void load()
                }
              }}
            >
              Actualizar listado
            </button>
          </div>
        )}
        {tab === 'configuration' ? (
          <section className={`${styles.panel} ${styles.config}`}>
            <h2>Qué falta para trabajar desde cualquier PC</h2>
            <p>
              {centralMode ? 'Las operaciones del catálogo usan Supabase con acceso de personal autorizado.' : 'El panel está preparado para probar cambios localmente; todavía no tiene inicio de sesión ni una base de datos compartida.'}
            </p>
            <ul>
              <li>
                <strong>
                  Base de datos central{' '}
                  <span className={`${styles.badge} ${styles.warning}`}>
                    {centralMode ? 'Conectada' : 'Pendiente'}
                  </span>
                </strong>
                <small>
                  Conectar el repositorio del catálogo a una base de datos con
                  copias de seguridad, control de versiones y registro de
                  cambios.
                </small>
              </li>
              <li>
                <strong>
                  Usuarios y permisos{' '}
                  <span className={`${styles.badge} ${styles.warning}`}>
                    Pendiente
                  </span>
                </strong>
                <small>
                  Configurar inicio de sesión, recuperación de cuenta y permisos
                  del personal. Validar la sesión en cada operación del
                  servidor.
                </small>
              </li>
              <li>
                <strong>
                  Imágenes compartidas{' '}
                  <span className={`${styles.badge} ${styles.warning}`}>
                    Pendiente
                  </span>
                </strong>
                <small>
                  Configurar almacenamiento central para las nuevas fotos. Las
                  imágenes actuales se conservan.
                </small>
              </li>
              <li>
                <strong>
                  Publicación <span className={styles.badge}>No realizada</span>
                </strong>
                <small>
                  En producción, las operaciones administrativas devuelven
                  acceso no habilitado. No se publicaron estos cambios.
                </small>
              </li>
            </ul>
            <p className={styles.hint}>
              La guía técnica está en docs/administracion.md. El almacenamiento
              de desarrollo no usa localStorage ni IndexedDB como fuente del
              catálogo.
            </p>
          </section>
        ) : (
          <>
            <div className={styles.stats}>
              {[
                {
                  label: 'Productos en catálogo',
                  value: products.length,
                  Icon: Package,
                },
                {
                  label: 'Activos',
                  value: products.filter((p) => p.available).length,
                  Icon: CheckCircle2,
                },
                {
                  label:
                    tab === 'featured'
                      ? 'Flyers destacados'
                      : 'Productos destacados',
                  value:
                    tab === 'featured'
                      ? (snapshot?.flyers ?? featuredFlyers).length
                      : featured.length,
                  Icon: Star,
                },
                {
                  label: 'Sin imagen',
                  value: products.filter((p) => !hasImage(p)).length,
                  Icon: ImageOff,
                },
              ].map((stat) => (
                <div className={styles.stat} key={stat.label}>
                  <small>
                    <stat.Icon />
                    {stat.label}
                  </small>
                  <strong>
                    {loading ? '—' : stat.value.toLocaleString('es-AR')}
                  </strong>
                </div>
              ))}
            </div>
            {tab === 'featured' ? (
              <>
                <FlyerManager
                  key={snapshot?.revision ?? 'loading'}
                  initialFlyers={snapshot?.flyers ?? featuredFlyers}
                  disabled={Boolean(disabled)}
                  onDirty={setFormDirty}
                  onSave={async (flyers) => {
                    await mutate(
                      { type: 'flyers', flyers },
                      'Flyers guardados. El carrusel del inicio ya está actualizado.',
                    )
                    setFormDirty(false)
                  }}
                />
                <details className="mt-6">
                  <summary className="mb-3 cursor-pointer text-sm font-semibold text-[#526980]">
                    Productos destacados del catálogo (opcional)
                  </summary>
                  <section
                    className={styles.panel}
                    aria-label="Orden de productos destacados"
                  >
                    <div className={styles.featuredHeader}>
                      <p>
                        Usá las flechas para ajustar el orden. Los inactivos o
                        sin stock no se muestran en la tienda.
                      </p>
                      <button
                        className={styles.primary}
                        disabled={disabled || !order}
                        onClick={async () => {
                          try {
                            await mutate(
                              { type: 'featured-order', ids: order! },
                              'Orden de destacados guardado.',
                            )
                            setOrder(null)
                          } catch (caught) {
                            setError(
                              caught instanceof Error
                                ? caught.message
                                : 'No se pudo guardar el orden.',
                            )
                          }
                        }}
                      >
                        <Check />
                        Guardar orden
                      </button>
                    </div>
                    {!ordered.length ? (
                      <div className={styles.empty}>
                        <Star size={32} />
                        <h2>Todavía no hay productos destacados</h2>
                        <p>
                          Marcá la estrella junto a un producto del listado.
                        </p>
                        <button
                          className={`${styles.button} mt-5`}
                          onClick={() => setTab('products')}
                        >
                          Elegir productos
                        </button>
                      </div>
                    ) : (
                      <ol className={styles.featuredList}>
                        {ordered.map((p, index) => (
                          <li key={p.id}>
                            <span className={styles.orderNumber}>
                              {index + 1}
                            </span>
                            <div className={styles.product}>
                              <ProductPhoto key={p.image} product={p} />
                              <div>
                                <p className={styles.productName}>{p.name}</p>
                                <small>
                                  {p.available && p.stock
                                    ? formatMoney(p.price)
                                    : 'No visible: inactivo o sin stock'}
                                </small>
                              </div>
                            </div>
                            <div className={styles.rowActions}>
                              {[-1, 1].map((direction) => (
                                <button
                                  key={direction}
                                  className={styles.iconButton}
                                  disabled={
                                    busy ||
                                    index + direction < 0 ||
                                    index + direction >= ordered.length
                                  }
                                  aria-label={`${direction < 0 ? 'Subir' : 'Bajar'} ${p.name}`}
                                  onClick={() => {
                                    const ids = ordered.map((item) => item.id)
                                    ;[ids[index], ids[index + direction]] = [
                                      ids[index + direction],
                                      ids[index],
                                    ]
                                    setOrder(ids)
                                  }}
                                >
                                  {direction < 0 ? <ArrowUp /> : <ArrowDown />}
                                </button>
                              ))}
                              {starControl(p)}
                            </div>
                          </li>
                        ))}
                      </ol>
                    )}
                  </section>
                </details>
              </>
            ) : (
              <section
                className={styles.panel}
                aria-label="Listado de productos"
              >
                <div className={styles.toolbar}>
                  <label className={styles.search}>
                    <Search />
                    <input
                      aria-label="Buscar en el catálogo"
                      value={query}
                      placeholder="Buscar por nombre, código o EAN"
                      onChange={(e) => {
                        setQuery(e.target.value)
                        setPage(0)
                      }}
                    />
                  </label>
                  <select
                    aria-label="Filtrar por familia"
                    value={family}
                    onChange={(e) => {
                      setFamily(e.target.value)
                      setPage(0)
                    }}
                  >
                    <option value="">Todas las familias</option>
                    {families.map((f) => (
                      <option key={f}>{f}</option>
                    ))}
                  </select>
                  <button
                    className={styles.iconButton}
                    disabled={busy || loading || !localMode}
                    aria-label="Actualizar catálogo"
                    onClick={() => {
                      if (discard()) {
                        setQuickPrice(null)
                        setOrder(null)
                        void load()
                      }
                    }}
                  >
                    <RefreshCw className={loading ? 'animate-spin' : ''} />
                  </button>
                </div>
                <div className={styles.filters} aria-label="Filtrar productos">
                  {[
                    { id: 'all', label: 'Todos' },
                    { id: 'active', label: 'Activos' },
                    { id: 'inactive', label: 'Inactivos' },
                    { id: 'featured', label: 'Destacados' },
                    { id: 'no-image', label: 'Sin imagen' },
                  ].map((item) => (
                    <button
                      className={styles.filter}
                      key={item.id}
                      aria-pressed={filter === item.id}
                      onClick={() => {
                        setFilter(item.id)
                        setPage(0)
                      }}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
                {selected.length > 0 && (
                  <div className={styles.selection}>
                    <strong>{selected.length} seleccionados</strong>
                    <button
                      onClick={() => {
                        if (discard()) {
                          setQuickPrice(null)
                          setAdjustment(true)
                        }
                      }}
                    >
                      Ajustar precios de la selección
                    </button>
                    <button onClick={() => setSelected([])}>
                      Quitar selección
                    </button>
                  </div>
                )}
                {loading ? (
                  <div className={styles.empty} role="status">
                    Cargando catálogo…
                  </div>
                ) : !filtered.length ? (
                  <div className={styles.empty}>
                    <Search size={32} />
                    <h2>
                      {localMode
                        ? 'No encontramos productos'
                        : 'El panel todavía no está habilitado'}
                    </h2>
                    <p>
                      {localMode
                        ? 'Probá con otro nombre, código o familia.'
                        : 'Consultá la configuración para conocer los pasos pendientes.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <table className={styles.table}>
                      <caption className="sr-only">
                        Catálogo de Market Mutual. Los precios se pueden editar
                        desde el listado.
                      </caption>
                      <thead>
                        <tr>
                          <th>
                            <input
                              type="checkbox"
                              aria-label="Seleccionar productos de esta página"
                              checked={allSelected}
                              onChange={() =>
                                setSelected(
                                  allSelected
                                    ? selected.filter(
                                        (id) =>
                                          !visible.some((p) => p.id === id),
                                      )
                                    : [
                                        ...new Set([
                                          ...selected,
                                          ...visible.map((p) => p.id),
                                        ]),
                                      ],
                                )
                              }
                            />
                          </th>
                          <th>Producto</th>
                          <th>Familia</th>
                          <th>Precio</th>
                          <th>Estado</th>
                          <th>Destacado</th>
                          <th>
                            <span className="sr-only">Editar</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {visible.map((p) => (
                          <tr key={p.id}>
                            <td>
                              <input
                                type="checkbox"
                                aria-label={`Seleccionar ${p.name}`}
                                checked={selected.includes(p.id)}
                                onChange={() => selectProduct(p.id)}
                              />
                            </td>
                            <td>
                              <div className={styles.product}>
                                <ProductPhoto key={p.image} product={p} />
                                <div>
                                  <p className={styles.productName}>{p.name}</p>
                                  <div className={styles.code}>
                                    Código {p.sku}
                                    <br />
                                    EAN {p.barcode || 'Sin asignar'}
                                  </div>
                                </div>
                              </div>
                            </td>
                            <td>{p.category}</td>
                            <td>{priceControl(p)}</td>
                            <td>{stateControl(p)}</td>
                            <td>{starControl(p)}</td>
                            <td>
                              <button
                                className={styles.iconButton}
                                disabled={disabled}
                                aria-label={`Editar ${p.name}`}
                                onClick={() => edit(p)}
                              >
                                <Pencil />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <div className={styles.mobileList}>
                      {visible.map((p) => (
                        <article className={styles.mobileCard} key={p.id}>
                          <input
                            type="checkbox"
                            aria-label={`Seleccionar ${p.name}`}
                            checked={selected.includes(p.id)}
                            onChange={() => selectProduct(p.id)}
                          />
                          <ProductPhoto key={p.image} product={p} />
                          <div>
                            <p className={styles.productName}>{p.name}</p>
                            <div className={styles.code}>
                              Código {p.sku} · EAN {p.barcode || 'Sin asignar'}
                            </div>
                            <small>{p.category}</small>
                          </div>
                          <div className={styles.rowActions}>
                            <div>
                              {priceControl(p)}
                              {stateControl(p)}
                            </div>
                            <div className={styles.rowActions}>
                              {starControl(p)}
                              <button
                                className={styles.iconButton}
                                disabled={disabled}
                                aria-label={`Editar ${p.name}`}
                                onClick={() => edit(p)}
                              >
                                <Pencil />
                              </button>
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  </>
                )}
                <div className={styles.footer}>
                  <span>
                    {filtered.length
                      ? `${currentPage * PAGE_SIZE + 1}–${Math.min((currentPage + 1) * PAGE_SIZE, filtered.length)} de ${filtered.length} productos`
                      : '0 productos'}
                  </span>
                  <div className={styles.pagination}>
                    <button
                      className={styles.iconButton}
                      disabled={currentPage === 0}
                      aria-label="Página anterior"
                      onClick={() => setPage(currentPage - 1)}
                    >
                      <ChevronLeft />
                    </button>
                    <span>
                      {currentPage + 1} de {pageCount}
                    </span>
                    <button
                      className={styles.iconButton}
                      disabled={currentPage >= pageCount - 1}
                      aria-label="Página siguiente"
                      onClick={() => setPage(currentPage + 1)}
                    >
                      <ChevronRight />
                    </button>
                  </div>
                </div>
              </section>
            )}
          </>
        )}
        <p className="mt-6 text-xs text-slate-500">
          Los cambios de prueba se reflejan en la tienda. La cantidad de
          stock se mantiene fuera de las vistas de clientes.
        </p>
      </div>
      {editor !== undefined && (
        <ProductEditor
          product={editor}
          families={families}
          onSave={saveProduct}
          onClose={closeModal}
          onDirty={setFormDirty}
        />
      )}
      {adjustment && (
        <PriceAdjustment
          products={products}
          families={families}
          selected={selected}
          onClose={closeModal}
          onDirty={setFormDirty}
          onApply={async (changes) => {
            await mutate(
              { type: 'prices', changes },
              `${changes.length} precios actualizados.`,
            )
            setAdjustment(false)
            setFormDirty(false)
            setSelected([])
          }}
        />
      )}
    </main>
  )
}
