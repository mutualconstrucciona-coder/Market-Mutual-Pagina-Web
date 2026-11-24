# Cloudflare Workers test deployment

This configuration is isolated to the `cloudflare-test` branch and targets the
Worker `market-mutual-test`. It does not define custom routes or domains.

## Cloudflare Workers Builds commands

- Build command: `pnpm run build:cloudflare`
- Deploy command: `pnpm run deploy:cloudflare`
- Preview command (Cloudflare branch previews): `pnpm run preview:cloudflare`

For a local Workers-runtime preview after building, use
`pnpm run preview:cloudflare:local`. Cloudflare's Git integration requires the
branch-preview command to invoke `wrangler preview`, which is different from
OpenNext's local preview server.

The deploy command is documented for the Cloudflare dashboard but must not be
run until the test branch has been reviewed and the required secrets exist.

## Required environment variables

Set these as Worker runtime secrets and, independently, in the Preview Base
secrets if branch previews are enabled. The build itself succeeds without
application secrets, so the service-role key does not need to be exposed to the
build step. Do not put values in `wrangler.jsonc` or commit a `.dev.vars` file.

- `SUPABASE_URL`: URL of the existing Market Mutual Supabase project.
- `SUPABASE_PUBLISHABLE_KEY`: publishable key used by server-side Auth calls.
- `SUPABASE_SECRET_KEY`: secret, server-only key used by REST and Storage.

The application also accepts `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` as temporary legacy fallbacks outside Cloudflare.
Never expose `SUPABASE_SECRET_KEY` or `SUPABASE_SERVICE_ROLE_KEY` to a browser.

The repository pins Node.js 22 through `.node-version` and pnpm through the
`packageManager` field, so no version variables are required in the dashboard.

Do not set `MARKET_ADMIN_LOCAL` or `MARKET_ADMIN_DATA_DIR` in Cloudflare. Their
filesystem fallback exists only for local development and Worker filesystems
are not persistent.

## Deliberately omitted resources

No R2 cache or Cloudflare Images binding is required: the application does not
use ISR, and `next.config.mjs` has image optimization disabled. The public
catalog and administrator continue using the existing Supabase REST, Auth and
Storage services.
