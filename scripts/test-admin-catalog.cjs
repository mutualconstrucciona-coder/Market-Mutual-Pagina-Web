/* eslint-disable @typescript-eslint/no-require-imports -- Node's built-in test runner executes this CommonJS harness. */
const { test } = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const ts = require('typescript')
const Module = require('node:module')
// Compile the actual pure domain rules, without a test-only reimplementation.
const filename = path.resolve('lib/admin/catalog-rules.ts')
const compiled = ts.transpileModule(fs.readFileSync(filename, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
  },
}).outputText
const mod = new Module(filename, module)
mod.filename = filename
mod.paths = module.paths
mod._compile(compiled, filename)
const { applyCatalogCommand, pricePreview, parsePriceInput } = mod.exports

function loadTs(relativePath, stubs = {}) {
  const target = path.resolve(relativePath)
  const output = ts.transpileModule(fs.readFileSync(target, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const loaded = new Module(target, module)
  loaded.filename = target
  loaded.paths = module.paths
  const originalRequire = loaded.require.bind(loaded)
  loaded.require = (request) => (request in stubs ? stubs[request] : originalRequire(request))
  loaded._compile(output, target)
  return loaded.exports
}
const inventory = loadTs('lib/inventory.ts')
const importRules = loadTs('lib/admin/import-rules.ts', {
  '@/lib/inventory': inventory,
})
const { buildImportPreview, applyImportChanges, revertImportChanges } = importRules
const importFile = loadTs('lib/admin/import-file.ts', {
  'server-only': {},
})
const { parseImportFile } = importFile

test('Posberry CSV parsing preserves text codes, accents and quoted separators', async () => {
  const file = new File(
    [
      '\uFEFFCódigo interno;EAN;Stock;Producto\r\n' +
        '00017;07790000000001;4;Yerba Ñandú\r\n' +
        '00018;07790000000002;3;"Galletitas, clásicas"\r\n',
    ],
    'stock-posberry.csv',
    { type: 'text/csv' },
  )
  const parsed = await parseImportFile(file)
  assert.equal(parsed.sheets.length, 1)
  assert.equal(parsed.sheets[0].name, 'CSV')
  assert.equal(parsed.sheets[0].rows[1][0], '00017')
  assert.equal(parsed.sheets[0].rows[1][1], '07790000000001')
  assert.equal(parsed.sheets[0].rows[1][3], 'Yerba Ñandú')
  assert.equal(parsed.sheets[0].rows[2][3], 'Galletitas, clásicas')
  assert.match(parsed.fileHash, /^[a-f0-9]{64}$/)
})

test('Argentine price formatting does not confuse thousands and cents', () => {
  assert.equal(parsePriceInput('1.250,50'), 1250.5)
  assert.equal(parsePriceInput('$ 1.000'), 1000)
  assert.equal(parsePriceInput('155.50'), 155.5)
  assert.equal(parsePriceInput('155,50'), 155.5)
  for (const value of ['', '1e3', '1250,501', 'abc'])
    assert.ok(Number.isNaN(parsePriceInput(value)))
})
const product = {
  id: 'sku:1',
  sku: '1',
  barcode: '7790000000001',
  name: 'Producto A',
  category: 'Almacén',
  price: 100,
  stock: 4,
  available: true,
  image: '/products/original.webp',
  imageSource: 'local-ean',
}
const snapshot = () => ({
  revision: 3,
  families: ['Almacén', 'Bebidas'],
  products: [
    { ...product },
    {
      ...product,
      id: 'sku:2',
      sku: '2',
      barcode: '7790000000002',
      name: 'Producto B',
      price: 200,
    },
  ],
})
const draft = () => ({ ...product, featured: false })
test('new products have stable server-generated identity and preserve existing records', () => {
  const s = snapshot()
  const next = applyCatalogCommand(
    s,
    {
      type: 'save',
      product: {
        ...draft(),
        id: undefined,
        sku: '3',
        barcode: '',
        image: undefined,
      },
    },
    'admin:new',
  )
  assert.equal(next.products[2].id, 'admin:new')
  assert.deepEqual(next.products.slice(0, 2), s.products)
  assert.equal(next.revision, 4)
})
test('duplicate SKU is rejected without mutation', () => {
  const s = snapshot()
  assert.throws(
    () =>
      applyCatalogCommand(
        s,
        { type: 'save', product: { ...draft(), sku: '2' } },
        '',
      ),
    (e) => Boolean(e.fields.sku),
  )
  assert.equal(s.products[0].sku, '1')
})
test('duplicate EAN is rejected on new/changed codes', () =>
  assert.throws(
    () =>
      applyCatalogCommand(
        snapshot(),
        { type: 'save', product: { ...draft(), barcode: '7790000000002' } },
        '',
      ),
    (e) => Boolean(e.fields.barcode),
  ))
test('existing legacy duplicate EAN does not block editing other fields', () => {
  const s = snapshot()
  s.products[1].barcode = product.barcode
  assert.equal(
    applyCatalogCommand(
      s,
      { type: 'save', product: { ...draft(), price: 105 } },
      '',
    ).products[0].price,
    105,
  )
})
test('price rejects zero, negative, NaN, infinity, fractions beyond cents and huge values', () => {
  for (const price of [0, -1, NaN, Infinity, 1.001, 1e10])
    assert.throws(() =>
      applyCatalogCommand(
        snapshot(),
        { type: 'prices', changes: [{ id: product.id, price }] },
        '',
      ),
    )
})
test('families and inventory are validated server-side', () => {
  for (const change of [
    { category: 'Inventada' },
    { stock: -1 },
    { stock: 1.5 },
  ])
    assert.throws(() =>
      applyCatalogCommand(
        snapshot(),
        { type: 'save', product: { ...draft(), ...change } },
        '',
      ),
    )
})
test('price batches are atomic when one change is invalid', () => {
  const s = snapshot()
  assert.throws(() =>
    applyCatalogCommand(
      s,
      {
        type: 'prices',
        changes: [
          { id: 'sku:1', price: 110 },
          { id: 'sku:2', price: 0 },
        ],
      },
      '',
    ),
  )
  assert.equal(s.products[0].price, 100)
})
test('preview roundings are the same values applied; stock/images/families remain intact', () => {
  const s = snapshot()
  const preview = pricePreview(s.products, ['sku:1', 'sku:2'], 12.345)
  const n = applyCatalogCommand(
    s,
    {
      type: 'prices',
      changes: preview.map(({ id, price }) => ({ id, price })),
    },
    '',
  )
  assert.equal(n.products[0].price, 112.35)
  assert.equal(n.products[1].price, 224.69)
  for (const p of n.products) {
    assert.equal(p.stock, 4)
    assert.equal(p.category, 'Almacén')
    assert.equal(p.image, product.image)
  }
})
test('invalid percentage bounds are rejected', () => {
  for (const value of [-100, -101, NaN, Infinity, 1001])
    assert.throws(() => pricePreview(snapshot().products, ['sku:1'], value))
})
test('deactivation preserves data and stable cart identity', () => {
  const n = applyCatalogCommand(
    snapshot(),
    { type: 'flags', id: 'sku:1', available: false },
    '',
  )
  assert.deepEqual(n.products[0], { ...product, available: false })
})
test('featured order must include exactly the current highlighted products', () => {
  const s = snapshot()
  s.products.forEach((p) => (p.featured = true))
  assert.throws(() =>
    applyCatalogCommand(
      s,
      { type: 'featured-order', ids: ['sku:1', 'sku:1'] },
      '',
    ),
  )
  const n = applyCatalogCommand(
    s,
    { type: 'featured-order', ids: ['sku:2', 'sku:1'] },
    '',
  )
  assert.equal(n.products[0].featuredOrder, 1)
  assert.equal(n.products[1].featuredOrder, 0)
})
test('external and inline image URLs cannot be injected', () => {
  for (const image of [
    'javascript:alert(1)',
    'data:image/svg+xml,xxx',
    'https://example.com/a.png',
  ])
    assert.throws(() =>
      applyCatalogCommand(
        snapshot(),
        { type: 'save', product: { ...draft(), image } },
        '',
      ),
    )
})

test('flyer list preserves products and existing images while reordering/removing', () => {
  const s = snapshot()
  s.flyers = [
    {
      id: 'delivery',
      title: 'Envíos',
      image: '/flyers/envios-market-mutual.png',
      href: '#entregas',
    },
    {
      id: 'kettle',
      title: 'Pava',
      image: '/flyers/pava-smart-life.png',
      href: '#productos',
    },
  ]
  const result = applyCatalogCommand(
    s,
    { type: 'flyers', flyers: [s.flyers[1], s.flyers[0]] },
    '',
  )
  assert.deepEqual(result.products, s.products)
  assert.deepEqual(
    result.flyers.map((f) => f.id),
    ['kettle', 'delivery'],
  )
  assert.equal(result.flyers[1].image, '/flyers/envios-market-mutual.png')
  assert.equal(
    applyCatalogCommand(s, { type: 'flyers', flyers: [] }, '').flyers.length,
    0,
  )
})
test('a maximum of five flyers is enforced on the server', () => {
  const s = snapshot()
  const flyer = {
    id: 'a',
    title: 'Promoción',
    image: '/api/catalog/images/00000000-0000-0000-0000-000000000000.webp',
  }
  assert.equal(
    applyCatalogCommand(
      s,
      {
        type: 'flyers',
        flyers: Array.from({ length: 5 }, (_, i) => ({
          ...flyer,
          id: String(i),
        })),
      },
      '',
    ).flyers.length,
    5,
  )
  assert.throws(
    () =>
      applyCatalogCommand(
        s,
        {
          type: 'flyers',
          flyers: Array.from({ length: 6 }, (_, i) => ({
            ...flyer,
            id: String(i),
          })),
        },
        '',
      ),
    /máximo de 5/,
  )
})
test('flyers reject duplicate identifiers, missing names and unsafe image/link URLs', () => {
  const s = snapshot()
  s.flyers = [
    { id: 'a', title: 'Envíos', image: '/flyers/envios-market-mutual.png' },
  ]
  for (const flyers of [
    [s.flyers[0], s.flyers[0]],
    [{ ...s.flyers[0], title: '' }],
    [{ ...s.flyers[0], image: 'https://example.com/image.png' }],
    [{ ...s.flyers[0], href: 'javascript:alert(1)' }],
  ])
    assert.throws(() => applyCatalogCommand(s, { type: 'flyers', flyers }, ''))
})

const importProducts = () => [
  { ...product, stock: 8, price: 100, available: true },
  { ...product, id: 'sku:2', sku: '0002', barcode: '07790000000002', name: 'Producto B', stock: 3, price: 200, available: true },
  { ...product, id: 'sku:3', sku: '3', barcode: '7790000000003', name: 'Producto C', stock: 0, price: 300, available: false },
]
const importSource = (kind, rows, extra = {}) => ({
  kind,
  fileName: 'posberry.xlsx',
  fileHash: 'a'.repeat(64),
  fileSize: 1200,
  sheetName: 'Productos',
  rows,
  headerRow: 0,
  mapping: { sku: 0, ean: 1, value: 2, name: 3 },
  missingStockPolicy: 'keep',
  ...extra,
})

test('stock import updates only matched products and preserves price, images and checkout data', () => {
  const products = importProducts()
  const preview = buildImportPreview(products, 7, importSource('stock', [
    ['Código interno', 'EAN', 'Stock', 'Producto'],
    ['1', '7790000000001', '2', 'Producto A'],
    ['999', '', '15', 'No existe'],
  ]))
  assert.equal(preview.modified, 1)
  assert.equal(preview.unmatched, 1)
  const next = applyImportChanges(products, preview.changes)
  assert.equal(next[0].stock, 2)
  assert.equal(next[0].price, 100)
  assert.equal(next[0].image, product.image)
  assert.deepEqual(next[1], products[1])
})

test('price import changes only price and rejects zero, negative, empty or invalid prices', () => {
  const products = importProducts()
  const valid = buildImportPreview(products, 1, importSource('price', [
    ['SKU', 'EAN', 'Precio', 'Producto'],
    ['1', '', '1.234,50', 'Producto A'],
  ]))
  const next = applyImportChanges(products, valid.changes)
  assert.equal(next[0].price, 1234.5)
  assert.equal(next[0].stock, 8)
  assert.equal(next[0].available, true)
  for (const value of ['', '0', '-1', 'abc']) {
    const preview = buildImportPreview(products, 1, importSource('price', [
      ['SKU', 'EAN', 'Precio', 'Producto'],
      ['1', '', value, 'Producto A'],
    ]))
    assert.equal(preview.invalid, 1)
    assert.equal(preview.criticalErrors, 1)
  }
})

test('stock threshold hides at 3, shows at 4, hides at zero and republishes after replenishment', () => {
  assert.equal(inventory.hasOnlineStock(3), false)
  assert.equal(inventory.hasOnlineStock(4), true)
  assert.equal(inventory.hasOnlineStock(0), false)
  const hidden = buildImportPreview(importProducts(), 1, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['1', '', '3', 'Producto A'],
  ]))
  assert.equal(hidden.hiddenByThreshold, 1)
  const republished = buildImportPreview(importProducts(), 1, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['0002', '', '4', 'Producto B'],
  ]))
  assert.equal(republished.republishedByThreshold, 1)
})

test('duplicate file rows and ambiguous legacy EAN matches are critical', () => {
  const products = importProducts()
  products[2].barcode = products[1].barcode
  const preview = buildImportPreview(products, 1, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'],
    ['1', '', '5', 'Producto A'],
    ['1', '', '6', 'Producto A repetido'],
    ['', '07790000000002', '8', 'EAN duplicado'],
  ]))
  assert.equal(preview.duplicates, 1)
  assert.equal(preview.ambiguous, 1)
  assert.equal(preview.criticalErrors, 2)
})

test('absent products are preserved by default and zeroed only after explicit full-inventory confirmation', () => {
  const products = importProducts()
  const keep = buildImportPreview(products, 2, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['1', '', '9', 'Producto A'],
  ]))
  assert.equal(keep.changes.length, 1)
  assert.equal(applyImportChanges(products, keep.changes)[1].stock, 3)
  assert.throws(() => buildImportPreview(products, 2, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['1', '', '9', 'Producto A'],
  ], { missingStockPolicy: 'zero', completeInventoryConfirmed: false })))
  const zero = buildImportPreview(products, 2, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['1', '', '9', 'Producto A'],
  ], { missingStockPolicy: 'zero', completeInventoryConfirmed: true }))
  assert.equal(applyImportChanges(products, zero.changes)[1].stock, 0)
})

test('revision values prevent stale apply and reversal restores only compatible fields', () => {
  const products = importProducts()
  const preview = buildImportPreview(products, 4, importSource('stock', [
    ['SKU', 'EAN', 'Stock', 'Producto'], ['1', '', '5', 'Producto A'],
  ]))
  assert.throws(() => applyImportChanges([{ ...products[0], stock: 6 }, ...products.slice(1)], preview.changes), /cambió/)
  const applied = applyImportChanges(products, preview.changes)
  assert.deepEqual(revertImportChanges(applied, preview.changes), products)
  assert.throws(() => revertImportChanges([{ ...applied[0], stock: 7 }, ...applied.slice(1)], preview.changes), /cambio posterior/)
})

test('all import API mutations require admin auth and migration records audit atomically', () => {
  for (const route of [
    'app/api/admin/imports/parse/route.ts',
    'app/api/admin/imports/preview/route.ts',
    'app/api/admin/imports/apply/route.ts',
    'app/api/admin/imports/history/route.ts',
    'app/api/admin/imports/revert/route.ts',
  ]) assert.match(fs.readFileSync(route, 'utf8'), /requireAdmin\(request\)/)
  const migration = fs.readFileSync('supabase/migrations/20261119175030_posberry_imports.sql', 'utf8')
  assert.match(migration, /insert into public\.market_catalog_audit/)
  assert.match(migration, /market_revision_conflict/)
  assert.match(migration, /market_duplicate_import/)
  assert.match(migration, /revoke all on table public\.market_catalog_imports from anon, authenticated/)
})
