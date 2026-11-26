'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileSpreadsheet,
  History,
  LoaderCircle,
  PackageSearch,
  RotateCcw,
  Search,
  Upload,
} from 'lucide-react'
import type { CatalogSnapshot } from '@/lib/admin/catalog-rules'
import {
  suggestImportMapping,
  compactImportSource,
  type ImportColumnMapping,
  type ImportKind,
  type ImportPreview,
  type ImportSource,
} from '@/lib/admin/import-rules'
import type { ImportHistoryItem } from '@/lib/admin/import-repository'
import type { ParsedImportFile } from '@/lib/admin/import-file'
import { IMPORT_FILE_SIZE_ERROR, MAX_IMPORT_FILE_MB, MAX_IMPORT_FILE_SIZE } from '@/lib/admin/import-limits'
import { ONLINE_STOCK_THRESHOLD } from '@/lib/inventory'
import { formatMoney } from '@/lib/utils'

type ParsedFile = ParsedImportFile

function readFileInBrowser(file: File): Promise<ParsedFile> {
  const worker = new Worker(new URL('../../lib/admin/import-file.worker.ts', import.meta.url))
  return new Promise<ParsedFile>((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      reject(new Error('El archivo tardó demasiado en procesarse. Probá exportar solo la hoja necesaria o usar CSV.'))
    }, 60_000)
    worker.onmessage = ({ data }: MessageEvent<{ parsed?: ParsedFile; error?: string }>) => {
      window.clearTimeout(timeout)
      if (data.parsed) resolve(data.parsed)
      else reject(new Error(data.error || 'No se pudo leer el archivo.'))
    }
    worker.onerror = () => {
      window.clearTimeout(timeout)
      reject(new Error('No se pudo leer el archivo en el navegador.'))
    }
    worker.postMessage(file)
  }).finally(() => worker.terminate())
}

const emptyMapping = (): ImportColumnMapping => ({ value: -1 })
const statusLabel: Record<ImportPreview['rows'][number]['status'], string> = {
  change: 'Se actualizará',
  unchanged: 'Sin cambios',
  unmatched: 'Sin coincidencia',
  invalid: 'Fila inválida',
  duplicate: 'Duplicado',
  ambiguous: 'Ambiguo',
  'missing-zero': 'Ausente → 0',
}
const valueText = (kind: ImportKind, value?: number) =>
  value === undefined ? '—' : kind === 'price' ? formatMoney(value) : value.toLocaleString('es-AR')

export function ImportManager({
  snapshot,
  centralMode,
  onSnapshot,
  onNotice,
  onError,
}: {
  snapshot: CatalogSnapshot
  centralMode: boolean
  onSnapshot: (snapshot: CatalogSnapshot) => void
  onNotice: (message: string) => void
  onError: (message: string) => void
}) {
  const [kind, setKind] = useState<ImportKind>('stock')
  const [parsed, setParsed] = useState<ParsedFile | null>(null)
  const [sheetName, setSheetName] = useState('')
  const [headerRow, setHeaderRow] = useState(0)
  const [mapping, setMapping] = useState<ImportColumnMapping>(emptyMapping)
  const [missingPolicy, setMissingPolicy] = useState<'keep' | 'zero'>('keep')
  const [completeConfirmed, setCompleteConfirmed] = useState(false)
  const [preview, setPreview] = useState<ImportPreview | null>(null)
  const [busy, setBusy] = useState<'parse' | 'preview' | 'apply' | 'history' | 'revert' | ''>('')
  const [query, setQuery] = useState('')
  const [rowFilter, setRowFilter] = useState('all')
  const [history, setHistory] = useState<ImportHistoryItem[]>([])

  const sheet = parsed?.sheets.find((item) => item.name === sheetName) ?? parsed?.sheets[0]
  const headers = sheet?.rows[headerRow] ?? []
  const stage = preview ? 2 : parsed ? 1 : 0

  const configureSheet = (nextSheet: ParsedFile['sheets'][number], nextKind = kind) => {
    const suggestion = suggestImportMapping(nextSheet.rows, nextKind)
    setSheetName(nextSheet.name)
    setHeaderRow(suggestion.row)
    setMapping({ ...emptyMapping(), ...suggestion.mapping })
    setPreview(null)
  }

  const loadHistory = async () => {
    if (!centralMode) return
    setBusy('history')
    try {
      const response = await fetch('/api/admin/imports/history', { cache: 'no-store' })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setHistory(result)
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo cargar el historial.')
    } finally {
      setBusy('')
    }
  }

  useEffect(() => {
    if (!centralMode) return
    let active = true
    void fetch('/api/admin/imports/history', { cache: 'no-store' })
      .then(async (response) => {
        const result = await response.json()
        if (!response.ok) throw new Error(result.error)
        if (active) setHistory(result)
      })
      .catch((error) => {
        if (active) onError(error instanceof Error ? error.message : 'No se pudo cargar el historial.')
      })
    return () => {
      active = false
    }
  }, [centralMode, onError])

  const changeKind = (next: ImportKind) => {
    setKind(next)
    setPreview(null)
    if (sheet) configureSheet(sheet, next)
  }

  const upload = async (file?: File) => {
    if (!file) return
    setBusy('parse')
    onError('')
    try {
      if (file.size > MAX_IMPORT_FILE_SIZE) throw new Error(IMPORT_FILE_SIZE_ERROR)
      const result = await readFileInBrowser(file)
      setParsed(result)
      configureSheet(result.sheets[0])
      setMissingPolicy('keep')
      setCompleteConfirmed(false)
      onNotice('Archivo leído. Revisá la hoja y el mapeo antes de comparar.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo leer el archivo.')
    } finally {
      setBusy('')
    }
  }

  const source = (): ImportSource => {
    if (!parsed || !sheet) throw new Error('Cargá un archivo antes de continuar.')
    return compactImportSource({
      kind,
      fileName: parsed.fileName,
      fileHash: parsed.fileHash,
      fileSize: parsed.fileSize,
      sheetName: sheet.name,
      rows: sheet.rows,
      headerRow,
      mapping,
      missingStockPolicy: kind === 'stock' ? missingPolicy : undefined,
      completeInventoryConfirmed: kind === 'stock' ? completeConfirmed : undefined,
    })
  }

  const review = async () => {
    setBusy('preview')
    onError('')
    try {
      const response = await fetch('/api/admin/imports/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source() }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      setPreview(result)
      onNotice('Vista previa lista. Todavía no se modificó ningún producto.')
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo generar la vista previa.')
    } finally {
      setBusy('')
    }
  }

  const apply = async () => {
    if (!preview || preview.criticalErrors || !preview.modified) return
    if (!window.confirm(`¿Confirmar ${preview.modified.toLocaleString('es-AR')} cambios de ${kind === 'stock' ? 'stock' : 'precio'}? Esta acción quedará registrada y podrá revertirse si no hay conflictos posteriores.`)) return
    setBusy('apply')
    onError('')
    try {
      const response = await fetch('/api/admin/imports/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ source: source(), expectedRevision: preview.baseRevision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onSnapshot(result.snapshot)
      setHistory(result.history)
      setPreview(null)
      setParsed(null)
      onNotice(`${preview.modified.toLocaleString('es-AR')} productos actualizados correctamente.`)
      window.dispatchEvent(new Event('catalog-updated'))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo aplicar la importación.')
    } finally {
      setBusy('')
    }
  }

  const revert = async (item: ImportHistoryItem) => {
    if (!window.confirm(`¿Revertir la importación “${item.fileName}”? Solo se restaurará ${item.kind === 'stock' ? 'el stock' : 'el precio'} que modificó.`)) return
    setBusy('revert')
    onError('')
    try {
      const response = await fetch('/api/admin/imports/revert', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ importId: item.id, expectedRevision: snapshot.revision }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      onSnapshot(result.snapshot)
      setHistory(result.history)
      onNotice('Importación revertida. Los demás campos del catálogo se conservaron.')
      window.dispatchEvent(new Event('catalog-updated'))
    } catch (error) {
      onError(error instanceof Error ? error.message : 'No se pudo revertir la importación.')
    } finally {
      setBusy('')
    }
  }

  const shownRows = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase()
    return (preview?.rows ?? []).filter(
      (row) =>
        (rowFilter === 'all' || row.status === rowFilter) &&
        (!normalized || [row.product, row.code, row.ean].join(' ').toLocaleLowerCase().includes(normalized)),
    )
  }, [preview, query, rowFilter])

  return (
    <div className="space-y-7">
      <section className="overflow-hidden rounded-2xl border border-[#d8e4ef] bg-white shadow-[0_18px_50px_rgba(18,53,95,0.08)]">
        <div className="grid border-b border-[#d8e4ef] bg-[#f6faff] sm:grid-cols-3">
          {['Cargar y mapear', 'Revisar cambios', 'Confirmar'].map((label, index) => (
            <div key={label} className={`flex items-center gap-3 px-5 py-4 text-sm font-semibold ${stage === index ? 'bg-white text-[#1456a0]' : stage > index ? 'text-emerald-700' : 'text-slate-400'}`}>
              <span className={`grid size-8 place-items-center rounded-full ${stage >= index ? 'bg-[#1456a0] text-white' : 'bg-slate-200 text-slate-500'}`}>{index + 1}</span>
              {label}
            </div>
          ))}
        </div>

        <div className="p-5 sm:p-7">
          <div className="mb-6 flex flex-wrap gap-2" role="tablist" aria-label="Tipo de importación">
            {(['stock', 'price'] as const).map((item) => (
              <button key={item} type="button" role="tab" aria-selected={kind === item} onClick={() => changeKind(item)} className={`min-h-11 rounded-xl border px-5 text-sm font-bold transition ${kind === item ? 'border-[#1456a0] bg-[#1456a0] text-white shadow-md' : 'border-[#d8e4ef] bg-white text-[#12355f] hover:bg-[#f2f7fc]'}`}>
                {item === 'stock' ? 'Actualizar stock' : 'Actualizar lista de precios'}
              </button>
            ))}
          </div>

          {!parsed ? (
            <label className="flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-[#9fc3e7] bg-[radial-gradient(circle_at_top,#edf7ff,white_70%)] px-6 text-center transition hover:border-[#1456a0] hover:bg-[#edf7ff] focus-within:ring-4 focus-within:ring-blue-100">
              {busy === 'parse' ? <LoaderCircle className="mb-4 size-11 animate-spin text-[#1456a0]" /> : <Upload className="mb-4 size-11 text-[#2581d2]" />}
              <strong className="text-xl text-[#12355f]">Seleccioná el archivo de Posberry</strong>
              <span className="mt-2 max-w-xl text-sm leading-6 text-slate-600">Excel .xlsx, .xls compatible o CSV, hasta {MAX_IMPORT_FILE_MB} MB. El navegador lee el archivo y el servidor valida los datos antes de confirmar.</span>
              <span className="mt-5 rounded-lg bg-white px-4 py-2 text-sm font-bold text-[#1456a0] shadow-sm">Elegir archivo</span>
              <input className="sr-only" type="file" accept=".xlsx,.xls,.csv" disabled={busy === 'parse'} onChange={(event) => void upload(event.target.files?.[0])} />
            </label>
          ) : (
            <div className="space-y-6">
              <div className="flex flex-col gap-4 rounded-xl border border-[#d8e4ef] bg-[#f8fbfe] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e1f0ff] text-[#1456a0]"><FileSpreadsheet /></span>
                  <div className="min-w-0"><strong className="block truncate text-[#12355f]">{parsed.fileName}</strong><span className="text-xs text-slate-500">{(parsed.fileSize / 1024).toLocaleString('es-AR', { maximumFractionDigits: 0 })} KB · {parsed.sheets.length} {parsed.sheets.length === 1 ? 'hoja' : 'hojas'}</span></div>
                </div>
                <button className="min-h-11 rounded-lg border border-[#cbdbe9] bg-white px-4 text-sm font-semibold text-[#12355f]" onClick={() => { setParsed(null); setPreview(null) }}>Cambiar archivo</button>
              </div>

              <div className="grid gap-5 lg:grid-cols-2">
                <label className="text-sm font-semibold text-[#12355f]">Hoja del archivo
                  <select className="mt-2 min-h-11 w-full rounded-lg border border-[#cbdbe9] bg-white px-3 font-normal" value={sheet?.name} onChange={(event) => configureSheet(parsed.sheets.find((item) => item.name === event.target.value)!)}>
                    {parsed.sheets.map((item) => <option key={item.name} value={item.name}>{item.name} · {item.rowCount.toLocaleString('es-AR')} filas</option>)}
                  </select>
                </label>
                <label className="text-sm font-semibold text-[#12355f]">Fila de encabezados
                  <select className="mt-2 min-h-11 w-full rounded-lg border border-[#cbdbe9] bg-white px-3 font-normal" value={headerRow} onChange={(event) => { setHeaderRow(Number(event.target.value)); setPreview(null) }}>
                    {sheet?.rows.slice(0, 30).map((row, index) => <option key={index} value={index}>Fila {index + 1}: {row.slice(0, 4).join(' · ') || '(vacía)'}</option>)}
                  </select>
                </label>
              </div>

              <fieldset>
                <legend className="mb-3 text-sm font-bold text-[#12355f]">Asigná las columnas</legend>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  {([
                    ['sku', 'Código interno / SKU', false],
                    ['ean', 'EAN', false],
                    ['name', 'Nombre (opcional)', false],
                    ['value', kind === 'stock' ? 'Stock nuevo' : 'Precio nuevo', true],
                  ] as const).map(([field, label, required]) => (
                    <label key={field} className="text-xs font-bold uppercase tracking-wide text-slate-600">{label}{required && ' *'}
                      <select className="mt-2 min-h-11 w-full rounded-lg border border-[#cbdbe9] bg-white px-3 text-sm font-normal normal-case tracking-normal text-[#12355f]" value={mapping[field] ?? ''} onChange={(event) => { setMapping((current) => ({ ...current, [field]: event.target.value === '' ? undefined : Number(event.target.value) })); setPreview(null) }}>
                        {!required && <option value="">No usar</option>}
                        {required && <option value="">Seleccionar…</option>}
                        {headers.map((header, index) => <option key={index} value={index}>{String(header || `Columna ${index + 1}`)}</option>)}
                      </select>
                    </label>
                  ))}
                </div>
                <p className="mt-3 text-xs text-slate-500">Se prioriza el código interno. El EAN solo se usa cuando identifica un único producto; nunca se cruza por similitud de nombres.</p>
              </fieldset>

              {kind === 'stock' && (
                <fieldset className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
                  <legend className="px-2 text-sm font-bold text-[#12355f]">Productos ausentes del archivo</legend>
                  <label className="mt-2 flex gap-3 text-sm"><input type="radio" name="missing" checked={missingPolicy === 'keep'} onChange={() => { setMissingPolicy('keep'); setCompleteConfirmed(false); setPreview(null) }} /> <span><strong>Conservar stock actual</strong><br /><span className="text-slate-600">Opción predeterminada y más segura.</span></span></label>
                  <label className="mt-3 flex gap-3 text-sm"><input type="radio" name="missing" checked={missingPolicy === 'zero'} onChange={() => { setMissingPolicy('zero'); setPreview(null) }} /> <span><strong>Establecer ausentes en cero</strong><br /><span className="text-slate-600">Solo para un inventario completo.</span></span></label>
                  {missingPolicy === 'zero' && <label className="mt-4 flex gap-3 rounded-lg bg-white p-3 text-sm font-semibold text-amber-900"><input type="checkbox" checked={completeConfirmed} onChange={(event) => { setCompleteConfirmed(event.target.checked); setPreview(null) }} /> Confirmo que este archivo contiene el inventario completo de Posberry.</label>}
                </fieldset>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#e2eaf1] pt-5">
                <p className="text-xs text-slate-500">Catálogo central: revisión {snapshot.revision} · quiebre online: stock ≤ {ONLINE_STOCK_THRESHOLD}</p>
                <button className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#1456a0] px-5 text-sm font-bold text-white shadow-md transition hover:bg-[#0d4381] disabled:cursor-not-allowed disabled:opacity-50" disabled={busy === 'preview' || mapping.value === undefined || mapping.value < 0 || (mapping.sku === undefined && mapping.ean === undefined) || (missingPolicy === 'zero' && !completeConfirmed)} onClick={() => void review()}>
                  {busy === 'preview' ? <LoaderCircle className="animate-spin" /> : <PackageSearch />} Revisar cambios <ArrowRight />
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {preview && (
        <section className="overflow-hidden rounded-2xl border border-[#d8e4ef] bg-white shadow-[0_18px_50px_rgba(18,53,95,0.08)]">
          <div className="border-b border-[#d8e4ef] bg-[#f8fbfe] p-5 sm:p-6">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-[#2581d2]">Paso 2 · Vista previa</p><h2 className="mt-1 text-2xl font-bold text-[#12355f]">Revisá antes de guardar</h2></div>
              <div className="flex flex-wrap gap-2">
                {[['Analizados', preview.analyzed], ['Coincidencias', preview.matched], ['Cambios', preview.modified], ['Sin coincidencia', preview.unmatched], ['Errores críticos', preview.criticalErrors]].map(([label, value]) => <div key={label} className="min-w-28 rounded-lg border border-[#d8e4ef] bg-white px-3 py-2"><span className="block text-[11px] font-bold uppercase text-slate-500">{label}</span><strong className="text-lg text-[#12355f]">{Number(value).toLocaleString('es-AR')}</strong></div>)}
              </div>
            </div>
            {kind === 'stock' && <div className="mt-4 flex flex-wrap gap-3 text-sm"><span className="rounded-full bg-red-50 px-3 py-1.5 font-semibold text-red-700">{preview.hiddenByThreshold} se ocultarán</span><span className="rounded-full bg-emerald-50 px-3 py-1.5 font-semibold text-emerald-700">{preview.republishedByThreshold} volverán a publicarse</span><span className="rounded-full bg-slate-100 px-3 py-1.5 font-semibold text-slate-700">{preview.missingProducts} ausentes del archivo</span></div>}
          </div>
          <div className="flex flex-col gap-3 border-b border-[#d8e4ef] p-4 sm:flex-row">
            <label className="flex min-h-11 flex-1 items-center gap-2 rounded-lg border border-[#cbdbe9] px-3"><Search className="size-4 text-slate-400" /><span className="sr-only">Buscar en la vista previa</span><input className="w-full bg-transparent text-sm outline-none" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, código o EAN" /></label>
            <select className="min-h-11 rounded-lg border border-[#cbdbe9] bg-white px-3 text-sm" value={rowFilter} onChange={(event) => setRowFilter(event.target.value)} aria-label="Filtrar resultados"><option value="all">Todos los estados</option>{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
          </div>
          <div className="max-h-[560px] overflow-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-[#edf5fc] text-xs uppercase tracking-wide text-[#385d81]"><tr><th className="p-3">Fila</th><th className="p-3">Producto</th><th className="p-3">Código</th><th className="p-3">{kind === 'stock' ? 'Stock actual' : 'Precio actual'}</th><th className="p-3">{kind === 'stock' ? 'Stock nuevo' : 'Precio nuevo'}</th>{kind === 'stock' && <th className="p-3">Estado online</th>}<th className="p-3">Resultado</th></tr></thead>
              <tbody>{shownRows.slice(0, 500).map((row, index) => <tr key={`${row.rowNumber}-${row.productId}-${index}`} className="border-t border-[#e5edf4]"><td className="p-3 text-slate-500">{row.rowNumber ?? '—'}</td><td className="p-3 font-semibold text-[#12355f]">{row.product}</td><td className="p-3 text-slate-600">{row.code || '—'}<br /><span className="text-xs">{row.ean || 'Sin EAN'}</span></td><td className="p-3">{valueText(kind, row.before)}</td><td className="p-3 font-bold">{valueText(kind, row.after)}</td>{kind === 'stock' && <td className="p-3">{row.onlineBefore === undefined ? '—' : `${row.onlineBefore ? 'Visible' : 'Oculto'} → ${row.onlineAfter ? 'Visible' : 'Oculto'}`}</td>}<td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs font-bold ${['invalid', 'duplicate', 'ambiguous'].includes(row.status) ? 'bg-red-50 text-red-700' : row.status === 'unmatched' ? 'bg-amber-50 text-amber-700' : row.status === 'unchanged' ? 'bg-slate-100 text-slate-600' : 'bg-blue-50 text-blue-700'}`}>{statusLabel[row.status]}</span><span className="mt-1 block max-w-xs text-xs text-slate-500">{row.message}</span></td></tr>)}</tbody>
            </table>
          </div>
          {shownRows.length > 500 && <p className="border-t p-3 text-center text-xs text-slate-500">Se muestran 500 de {shownRows.length.toLocaleString('es-AR')} filas. Usá el buscador para acotar.</p>}
          <div className="flex flex-col gap-4 border-t border-[#d8e4ef] p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>{preview.criticalErrors > 0 ? <p className="flex items-center gap-2 font-semibold text-red-700"><AlertTriangle /> Hay {preview.criticalErrors} errores críticos. Corregí el archivo o el mapeo.</p> : <p className="flex items-center gap-2 font-semibold text-emerald-700"><CheckCircle2 /> La importación está lista para confirmar.</p>}<p className="mt-1 text-xs text-slate-500">Confirmar actualizará solo {kind === 'stock' ? 'stock' : 'precios'}; los demás datos se conservan.</p></div>
            <button className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#0b3768] px-6 text-sm font-bold text-white shadow-lg transition hover:bg-[#082d57] disabled:cursor-not-allowed disabled:opacity-50" disabled={!centralMode || preview.criticalErrors > 0 || preview.modified === 0 || busy === 'apply'} onClick={() => void apply()}>{busy === 'apply' ? <LoaderCircle className="animate-spin" /> : <CheckCircle2 />} Confirmar importación</button>
          </div>
          {!centralMode && <p className="border-t border-amber-200 bg-amber-50 p-3 text-center text-sm font-semibold text-amber-800">La vista previa funciona en desarrollo, pero confirmar requiere Supabase central.</p>}
        </section>
      )}

      <section className="overflow-hidden rounded-2xl border border-[#d8e4ef] bg-white shadow-[0_18px_50px_rgba(18,53,95,0.08)]">
        <div className="flex items-center justify-between border-b border-[#d8e4ef] bg-[#f8fbfe] p-5"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-[#e1f0ff] text-[#1456a0]"><History /></span><div><h2 className="font-bold text-[#12355f]">Historial de importaciones</h2><p className="text-xs text-slate-500">Últimas 50 operaciones aplicadas al catálogo central.</p></div></div><button className="min-h-11 rounded-lg border border-[#cbdbe9] bg-white px-4 text-sm font-semibold" disabled={!centralMode || busy === 'history'} onClick={() => void loadHistory()}>Actualizar</button></div>
        {!history.length ? <div className="p-10 text-center text-sm text-slate-500">{centralMode ? 'Todavía no hay importaciones registradas.' : 'El historial estará disponible al conectar Supabase.'}</div> : <div className="divide-y divide-[#e5edf4]">{history.map((item) => <article key={item.id} className="grid gap-4 p-5 lg:grid-cols-[1fr_auto_auto] lg:items-center"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><strong className="truncate text-[#12355f]">{item.fileName}</strong><span className="rounded-full bg-blue-50 px-2 py-1 text-[11px] font-bold uppercase text-blue-700">{item.kind === 'stock' ? 'Stock' : 'Precios'}</span><span className={`rounded-full px-2 py-1 text-[11px] font-bold uppercase ${item.status === 'applied' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>{item.status === 'applied' ? 'Aplicada' : 'Revertida'}</span></div><p className="mt-1 text-xs text-slate-500">{new Date(item.createdAt).toLocaleString('es-AR')} · {item.actorEmail} · hoja {item.sheetName}</p></div><div className="text-sm"><span className="block text-xs text-slate-500">Productos modificados</span><strong className="text-[#12355f]">{item.stats.modified.toLocaleString('es-AR')}</strong></div><button className="inline-flex min-h-11 items-center justify-center gap-2 rounded-lg border border-red-200 px-4 text-sm font-bold text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={item.status !== 'applied' || busy === 'revert'} onClick={() => void revert(item)}><RotateCcw className="size-4" /> Revertir</button></article>)}</div>}
      </section>
    </div>
  )
}
