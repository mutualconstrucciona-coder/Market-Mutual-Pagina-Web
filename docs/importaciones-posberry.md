# Importaciones masivas de Posberry

## Alcance

La sección **Administración → Importaciones** permite actualizar de manera independiente:

- stock real;
- precio de venta.

No reemplaza el catálogo, no crea productos, no elimina registros y no modifica imágenes, familias, descripciones, destacados, ofertas, precios anteriores ni el checkout de WhatsApp.

## Formatos y columnas

Se aceptan archivos de hasta 15 MB (15 MiB), con hasta 20.000 filas y 100 columnas por hoja:

- `.xlsx`;
- `.xls` cuando el contenido sea OOXML compatible (los XLS binarios antiguos deben exportarse a XLSX o CSV);
- `.csv` con coma, punto y coma o tabulación y codificación UTF-8 o Windows-1252.

El panel lee el archivo en un hilo del navegador y envía al servidor únicamente las columnas mapeadas. Los Excel con más de 48 MiB descomprimidos se deben exportar con menos hojas o como CSV. El tope de la solicitud de revisión y confirmación es de 8 MiB para los datos mapeados.

La interfaz muestra las hojas disponibles, permite elegir la fila de encabezados y siempre permite corregir el mapeo manual. Reconoce como sugerencias, sin aplicar cambios automáticamente:

| Dato | Encabezados habituales |
| --- | --- |
| SKU | `SKU`, `Código`, `Código interno`, `Cod interno`, `Código producto`, `Código artículo`, `ID producto` |
| EAN | `EAN`, `GTIN`, `Barcode`, `Código de barras`, `Cod barras` |
| Stock | `Stock`, `Existencia`, `Existencias`, `Cantidad`, `Saldo`, `Inventario` |
| Precio | `Precio`, `Precio venta`, `Precio de venta`, `Precio lista`, `Lista de precios`, `PVP` |
| Nombre opcional | `Producto`, `Descripción`, `Nombre`, `Artículo` |

Los códigos se tratan como texto. Si Excel guardó originalmente un código como número, los ceros que Excel ya haya eliminado no pueden reconstruirse; en ese caso debe exportarse la columna como texto o CSV. Nunca se intenta vincular por nombre.

Los importes admiten formatos argentinos como `1.234,50`, `1234,50` y valores numéricos. El stock debe ser entero y no negativo. El precio debe ser positivo y tener hasta dos decimales.

## Flujo seguro

1. **Cargar y mapear:** el servidor valida extensión, tamaño, estructura, cantidad de filas y tipos de celda.
2. **Revisar cambios:** el servidor vuelve a cruzar SKU y EAN contra la revisión actual del catálogo. Los duplicados, ambigüedades y valores inválidos bloquean la confirmación.
3. **Confirmar:** el servidor recalcula la vista previa, verifica la revisión y ejecuta una única función transaccional de PostgreSQL. Si alguna parte falla, no se guarda nada.

El SKU tiene prioridad. El EAN se usa solamente cuando identifica de forma inequívoca un producto. Si ambos están presentes pero señalan productos diferentes, la fila queda bloqueada como ambigua.

Para stock, los productos ausentes se conservan por defecto. La opción de establecerlos en cero exige seleccionar esa alternativa y confirmar expresamente que el archivo representa el inventario completo.

## Quiebre de stock

`ONLINE_STOCK_THRESHOLD` está centralizado en `lib/inventory.ts` y vale **3**:

- stock `> 3`: puede mostrarse online si el producto está activo;
- stock `<= 3`: se oculta en la API pública;
- cuando vuelve a superar 3, reaparece automáticamente si sigue activo.

La cantidad real permanece en Supabase y el panel, pero `/api/catalog` entrega una proyección sin stock preciso.

## Historial y reversión

La migración `20261119175030_posberry_imports.sql` agrega `market_catalog_imports` y dos RPC con `security invoker`. Cada importación guarda archivo, hash SHA-256, hoja, usuario, revisiones, estadísticas y valores anteriores/nuevos de los campos modificados. El mismo archivo y tipo no puede aplicarse dos veces.

La reversión restaura únicamente stock o precio. Antes de hacerlo, el servidor comprueba que cada campo todavía contiene el valor dejado por la importación; si un producto recibió otro cambio incompatible, se bloquea toda la reversión.

Las tablas continúan sin permisos para `anon` y `authenticated`. Solo el backend de Next.js usa la credencial privada después de verificar la sesión y `market_admin_users`.

## Habilitación en Supabase

La migración quedó versionada pero **no se aplicó al proyecto real** durante el desarrollo. Antes de habilitar la función:

1. Revisar la migración y probarla en una rama/entorno de Supabase que no contenga datos reales.
2. Reconciliar el historial local de migraciones con el historial remoto: el proyecto registra `20261119152447_market_mutual_initial` y `20261119153138_market_atomic_writes`, mientras algunos archivos históricos del repositorio usan otros números. No ejecutar `supabase db push` a ciegas.
3. Aplicar únicamente la migración de importaciones mediante el flujo de despliegue aprobado.
4. Ejecutar los advisors de seguridad, rendimiento y salud.
5. Verificar que Alejandra pueda iniciar sesión y que el historial abra sin errores.

## Primera importación real

1. Ingresar a `/admin` con una cuenta administradora autorizada.
2. Abrir **Importaciones** y elegir **Actualizar stock** o **Actualizar lista de precios**.
3. Cargar el archivo, seleccionar la hoja y comprobar el mapeo.
4. En stock, mantener **Conservar stock actual** salvo que el archivo sea un inventario completo confirmado.
5. Revisar coincidencias, errores, productos que se ocultan y productos que vuelven a publicarse.
6. Confirmar solamente si no hay errores críticos.
7. Comprobar la nueva revisión y el registro del historial antes de procesar otro archivo.
