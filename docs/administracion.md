# Administración de Market Mutual

> Actualización 19/11/2026: el repositorio correcto ya contiene persistencia central y autenticación en Supabase para el proyecto `qwbiemtonvzucatlvuri`. La descripción histórica de modo local que sigue debajo se conserva como referencia. Para el estado de producción consultar `docs/supabase-produccion.md`; para stock/precios de Posberry consultar `docs/importaciones-posberry.md`.

## Estado real

El panel `/admin` permite probar gestión de productos, fotos, precios y destacados. **No está habilitado para operación online ni para el personal.** No se encontró una base de datos, un servicio de autenticación ni credenciales configuradas en el proyecto. No se creó ni modificó infraestructura de producción.

El administrador anterior era un importador de archivos que guardaba su catálogo en IndexedDB. Se conservaron sus componentes y utilidades como referencia, pero sus operaciones de sustitución local se deshabilitaron: no deben competir con la fuente del servidor. Se reutilizaron el modelo de productos, las 22 familias, el buscador, las asociaciones de fotos, las tarjetas, la identidad visual y el carrito/checkout existentes.

## Abrir y probar en esta PC

Desde la raíz de `Market-Mutual-Pagina-Web`:

```powershell
npm install
npm run dev
```

Abrir `http://localhost:3000/admin` y la tienda `http://localhost:3000` en otra pestaña. El panel muestra permanentemente «Modo de prueba en esta PC» y «Sin conexión central». Solo se permiten operaciones administrativas en desarrollo, con hostname de loopback, y las escrituras verifican además Origin y Sec-Fetch-Site. Esto **no constituye autenticación de personal**.

- Crear/editar: «Nuevo producto» o el lápiz de una fila. EAN opcional; código interno único, familia existente, precio positivo con hasta dos decimales, stock entero no negativo.
- Fotos: seleccionar JPG, PNG o WebP de hasta 5 MB. Se decodifica y previsualiza la foto, sin recortar, y se convierte a WebP de hasta 1200 px. Solo se asocia al guardar el producto. Reemplazar nunca borra el archivo anterior.
- Precio individual: pulsar el importe, escribir y confirmar con la tilde.
- Porcentaje: seleccionar productos o elegir una familia. «Ver nuevos precios» no escribe; «Aplicar ajuste» guarda exactamente los importes previsualizados en una sola operación.
- Estado: pulsar Activo/Inactivo. Desactivar requiere confirmación, oculta el producto de la tienda y conserva sus datos.
- Flyers del inicio: la pestaña «Destacados» muestra los tres flyers existentes (envíos, pava Smart Life y termo Peabody). Permite agregar, reemplazar, quitar y ordenar hasta **5 flyers**. Tamaño recomendado: **960 × 540 px**, horizontal 16:9; JPG, PNG o WebP de hasta 5 MB. Los cambios se aplican con «Guardar flyers» y se leen desde la misma fuente que el carrusel de la tienda. Quitar un flyer no borra el archivo original.
- Productos destacados: la selección con estrellas del catálogo se conserva en el apartado opcional «Productos destacados del catálogo», dentro de la pestaña «Destacados». Los productos inactivos o sin stock no aparecen en la tienda.
- Las pestañas de tienda vuelven a consultar al recuperar el foco y cada 15 segundos. Dentro de la misma pestaña se avisa inmediatamente después de guardar.

## Datos y conservación

El repositorio de desarrollo lee el catálogo JSON y las asociaciones de fotos actuales como semilla. **No reescribe** `public/data/catalog-posberry.json`, sus precios, familias o stock ni las imágenes actuales. La primera modificación crea `.market-admin/catalog.json`; las nuevas fotos se guardan con UUID en `.market-admin/uploads/`. Esta carpeta está ignorada por Git y debe conservarse si se quieren retener las pruebas. No se utiliza localStorage ni IndexedDB como fuente del catálogo administrado. El carrito conserva su almacenamiento local independiente.

La fuente es compartida por los clientes que consultan **este mismo servidor de desarrollo**, no por instalaciones en otras computadoras. Copiar el proyecto o hacer push no sincroniza `.market-admin`. No usar ese archivo en un hosting sin disco persistente, con varios procesos o como sustituto de una base de datos central.

El stock no se renderiza en tarjetas de clientes, carrito ni checkout. Actualmente las cantidades siguen llegando al cliente para conservar los límites del carrito existente, y el JSON histórico en `public/data` sigue siendo público. Por tanto **no es información confidencial protegida**. Para el despliegue central, usar una proyección pública sin stock y validar disponibilidad/cantidades del carrito y checkout en el servidor antes de confirmar un pedido. No se habilitó un checkout transaccional nuevo ni se alteró el envío por WhatsApp existente.

Cada guardado comprueba `revision`; si otra pestaña guardó antes, responde 409 y solicita actualizar. Un lote inválido se rechaza completo. La implementación local serializa escrituras dentro del proceso Next y reemplaza el archivo de manera atómica con su registro de operación. El adaptador central deberá resolverlo con transacciones de base de datos, no con esta cola en memoria.

Los códigos EAN duplicados o inválidos heredados no se inventan ni se corrigen automáticamente. Se permite conservar un EAN heredado sin cambios al editar precio u otros campos; introducir un EAN nuevo duplicado o con formato inválido se rechaza. El `id` del producto es estable aunque cambie su código interno, para conservar referencias del carrito.

## Qué conectar antes de habilitar al personal

1. **Persistencia central:** implementar `CatalogRepository` en `lib/admin/catalog-repository.ts` con una base de datos compartida y sustituir la fábrica `catalogRepository()`. Mantener validaciones en `lib/admin/catalog-rules.ts`, controles de revisión, transacciones de lotes, identidad estable, registro de actor/cambios y copias de seguridad. Migrar los 753 productos y sus asociaciones sin sustituir fotos; resolver explícitamente los EAN heredados antes de imponer unicidad a todos los registros.
2. **Autenticación:** integrar un proveedor de sesiones seguro. Sustituir el acceso local de `requireAdmin()` en `lib/admin/http.ts` por verificación de sesión en servidor y autorización de rol de administrador del mercado en **cada** lectura administrativa, escritura y subida de archivos. Configurar altas por invitación, recuperación, revocación y cierre de sesión. Nunca confiar en una bandera enviada por el navegador ni en una clave pública como permiso.
3. **Fotos centrales:** implementar almacenamiento persistente de objetos; validar el contenido y las dimensiones en el servidor, conservar los archivos anteriores y devolver URLs estables. Sustituir las rutas locales de carga/lectura y ajustar la lista de URLs permitidas. Planificar limpieza de subidas sin asociar después de un guardado fallido o cancelado, sin eliminar fotos en uso.
4. **Tienda:** `/api/catalog` debe leer el mismo repositorio y publicar solamente campos de clientes. Eliminar las cantidades de stock de esa respuesta y de cualquier archivo público al migrar, y validar de nuevo cantidades/precios en el checkout del servidor. Mantener ocultos los inactivos y sin stock y conservar los datos privados en rutas autorizadas.
5. **Habilitación:** probar usuarios, permisos, restauración de backups, concurrencia entre computadoras, límites de subida y carrito/checkout en un ambiente de pruebas. Recién después conectar el panel online. Las variables de entorno por sí solas **no activan** un adaptador central que todavía no existe.

En `next build` / `next start`, las rutas administrativas responden 503 y no leen ni escriben datos privados del modo de desarrollo, incluso si se establece `MARKET_ADMIN_LOCAL=1`. El panel muestra la configuración pendiente. Esta protección se debe reemplazar deliberadamente junto con la integración real, nunca quitarla para publicar la prueba local.

## Variables locales opcionales

```powershell
# Deshabilitar incluso las pruebas locales:
$env:MARKET_ADMIN_LOCAL="0"

# Usar una carpeta aislada para pruebas, sin tocar .market-admin:
$env:MARKET_ADMIN_DATA_DIR="C:\ruta\a\pruebas-market"
npm run dev
```

No se requieren credenciales para el desarrollo local; no se incluyeron claves ni usuarios ficticios en el panel.

## Verificación

```powershell
node --test scripts/test-admin-catalog.cjs
npm run typecheck
npm run lint
npm run build
```

Las pruebas de dominio cubren códigos duplicados, EAN heredados, campos inválidos, precios por lote, redondeo, conservación de fotos/stock/familias, identidad estable, desactivación y orden de destacados. Las pruebas de navegador y API se ejecutan contra una instancia local con `MARKET_ADMIN_DATA_DIR` separado; los productos de prueba no se incorporan al catálogo original.
