# Market Mutual · Supabase de producción

Proyecto dedicado: `qwbiemtonvzucatlvuri` — organización **Market Mutual**, región São Paulo.

## Estado
- Base creada con tres tablas RLS: `market_catalog_state`, `market_admin_users`, `market_catalog_audit`.
- Semilla importada: **753 productos, 22 familias y 3 flyers**.
- Storage: `market-product-images` y `market-flyers`.
- Escrituras administrativas transaccionales mediante `market_commit_catalog` (versión optimista + auditoría).
- El panel requiere un usuario de Supabase Auth con registro explícito en `market_admin_users`.
- Las fotos del repositorio se siguen sirviendo desde `public/products` y `public/flyers`; las fotos nuevas del panel se guardan en Storage.
- El checkout de WhatsApp es orientativo y **no** descuenta stock ni crea órdenes transaccionales.

## Configurar el entorno de ejecución
1. En el dashboard del proyecto, ir a **Settings → API Keys**.
2. Copiar una **publishable** (`sb_publishable_...`) o **anon** como `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
3. Copiar una **secret** (`sb_secret_...`) o **service_role** legacy como `SUPABASE_SERVICE_ROLE_KEY`. Esta clave **nunca** va a GitHub ni al navegador.
4. Configurar `SUPABASE_URL` usando la **Project URL** copiada desde **Supabase → Project Settings → API** (proyecto `qwbiemtonvzucatlvuri`). La URL completa no debe incluirse en archivos versionados para evitar el detector de secretos de Netlify.
5. Registrar los tres valores en variables de entorno del hosting; si la app ejecuta localmente, en `.env.local`.
6. Publicar **Next.js como aplicación con funciones de servidor**. No sirve una exportación estática para las APIs de catálogo y Auth.

El adaptador solo se activa si están presentes las tres variables. La URL está fijada en código al proyecto Market Mutual para evitar confundirlo con Bot Afiliados.

## Primer administrador
1. Crear un usuario real desde **Authentication → Users** en el proyecto Market Mutual. Elegir el método de creación/invitación y asegurarse de que pueda iniciar sesión con contraseña.
2. Copiar su UUID desde Supabase (no es la contraseña).
3. Ejecutar en **SQL Editor**, reemplazando el UUID de ejemplo con el real:

```sql
insert into public.market_admin_users (user_id)
values ('00000000-0000-0000-0000-000000000001')
on conflict (user_id) do nothing;
```

El UUID de ejemplo no corresponde a ningún usuario y **debe reemplazarse**. El inicio de sesión se realiza en `/admin` y caduca al vencimiento del token (máximo 1 hora; requiere reingreso). No existe registro libre de administradores.

## Seguridad y datos
- La tienda consulta `/api/catalog` del servidor, no accede a Postgres ni utiliza claves privadas desde el navegador.
- La respuesta pública oculta las **cantidades exactas** de stock; la validación definitiva debe realizarse manualmente antes de confirmar pedidos de WhatsApp.
- El histórico `public/data/catalog-posberry.json` aún contiene cantidades de la semilla y es accesible públicamente. Antes de producción debe retirarse de `public/` y ajustar las rutas que lo consumen si el stock debe ser confidencial.
- Las tablas no otorgan acceso a `anon`/`authenticated`, por diseño; solo el servidor accede con credenciales de servicio tras verificar Supabase Auth y la tabla de administradores.
- No ejecutar nuevamente la semilla de 753 productos si ya existe un catálogo en la base.
- Pendiente ejecutar y verificar: `pnpm install`, `pnpm typecheck`, `pnpm lint`, `pnpm test:admin`, `pnpm build`, pruebas de sesión, edición, subida de imágenes y checkout.
