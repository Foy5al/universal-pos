# Deploying to Vercel (free, non-commercial)

One Vercel project built from this repository with two
[Services](https://vercel.com/docs/services) plus a free Neon Postgres database:

| Service | Root       | Public path | Runtime                               |
| ------- | ---------- | ----------- | ------------------------------------- |
| `web`   | `apps/web` | `/`         | Next.js app and PWA shell             |
| `api`   | `apps/api` | `/api/*`    | one Express function (`api/index.ts`) |

`vercel.json` at the repository root owns the whole deployment: the two services
and the rewrite order (`/api/(.*)` to `api`, then `/(.*)` to `web`). Per-service
settings such as `framework` and `entrypoint` live in that file, not in a second
`vercel.json` inside an app directory.

Both services share one domain, one deployment and one set of environment
variables, so there is no `API_PROXY_TARGET` and no CORS: the browser calls
`/api/v1/...` on the origin that served it.

This is the temporary development target from ADR-0007 and `plan.md` §11. Vercel
Hobby forbids commercial use; a real store needs the Docker/VPS path first.

## 0. Public paths

- `web` answers every path except `/api/*`.
- `api` receives the original request path, `/api` included. `apps/api/api/index.ts`
  strips that deployment prefix before handing the request to Express, which
  keeps its versioned `/v1/*` routes (ADR-0007). `GET /api/v1/stores` reaches
  `GET /v1/stores`; `GET /api/health` reaches `GET /health`.
- Rewrites are evaluated in order, most specific first; the catch-all stays last.

New API routes are public at `/api/v1/<route>` with no routing change. The
`/api/v1/:path*` rewrite in `next.config.ts` is only used by `pnpm dev`, Docker
and a two-project setup; Vercel Services routes the request before Next.js runs.

## 1. Database (Neon free)

1. Create a Neon project and copy the **pooled** connection string (its host
   contains `-pooler`). The direct URL is only for migrations and `psql`.
2. Apply migrations from your machine, never from a cold start:

   ```bash
   DATABASE_URL="postgresql://.../pos?sslmode=require" pnpm --filter @pos/db db:migrate
   ```

3. Optional demo data: `DATABASE_URL="..." pnpm db:seed:demo`. Never seed demo
   credentials into a database that will hold real data.
4. Record a restore check: Neon keeps a short history window on the free plan;
   export a `pg_dump` somewhere else as well.

## 2. Import the project

1. Import this repository as one project and leave the root directory at the
   repository root — `vercel.json` declares both services. The import screen
   offers to split the detected apps into separate projects or group them with
   Services; Services is what this configuration expects.

2. Environment variables (Production and Preview):

   ```
   DATABASE_URL=postgresql://...-pooler.../pos?sslmode=require
   DATABASE_POOL_MAX=1
   ```

   Set `DATABASE_URL` before the first deploy: `createDefaultDeps()` throws when
   it is missing in production, so every request 500s until it is present. Both
   services receive the same variables; `NODE_ENV` is set by Vercel.

3. Optional server-side calls only: if a React Server Component or route handler
   ever needs the API directly, add a binding to the `web` service in
   `vercel.json` (see §3). Nothing does today.

## 3. Service bindings

`web` declares one binding to `api`, injected as `API_INTERNAL_URL`. Nothing
reads it yet: all API traffic comes from the browser through the public
`/api/v1/*` route, which is routing, not a binding. The binding exists so a React
Server Component or route handler can reach the API privately instead of over
the public domain.

Bindings resolve at runtime in functions only — never during a build and never
in middleware. The bound URL is the service root, so it has no `/api` prefix and
the caller adds the versioned path:

```ts
const url = new URL('/v1/stores', process.env.API_INTERNAL_URL);
```

Do not set `API_INTERNAL_URL` in the project environment; Vercel injects it. Add
one binding per target service on the **calling** service, not on the target.

## 4. Smoke test

```bash
curl -s https://<project>.vercel.app/api/health   # {"data":{"status":"ok"}}
curl -s -o /dev/null -w '%{http_code}\n' https://<project>.vercel.app/api/v1/stores  # 401
```

Then open the app, sign in, load the POS, make a cash sale, and reload with the
network offline to confirm the sale stays in the outbox. Preview deployments get
a separate URL but run the same services; point their `DATABASE_URL` at a Neon
branch, never at production.

## 5. Limits to design around

- Hobby functions are short-lived: no WebSockets, cron daemons, durable queues
  or local files. Queued exports and reconciliation workers need the Docker
  worker from `plan.md` §10.
- Cold starts plus Neon autosuspend (after ~5 idle minutes) make the first
  request slow; the POS must show offline/syncing states while it waits.
- The API is one Express bundle: `express.static()` does not serve files, so
  product images stay in Backblaze B2 through presigned URLs.
- `@node-rs/argon2` ships a platform binary. If a deployment fails with a
  missing `argon2-linux-x64-gnu` module, check the function bundle before
  changing the hashing policy in ADR-0009.
- Report exports are synchronous and bounded (ADR-0021). Large exports must
  become queued jobs before they move here.
- Services are in beta. If a service-level setting is ignored, fall back to two
  standalone projects (root `apps/web` and `apps/api`) and set
  `API_PROXY_TARGET` on the web project.

## 6. Production migrations from GitHub Actions

`.github/workflows/migrate.yml` applies pending Drizzle migrations to Neon on
every push to `main`. It deliberately does **not** deploy: the Vercel project is
connected to the repository, so Vercel builds and promotes the commit itself.
Triggering a second deployment from Actions would build the same commit twice.

1. Repository secret `DATABASE_URL`: the Neon **direct** URL (its host has no
   `-pooler`), so `drizzle-kit migrate` does not run through the pooler.
2. Repository variable `DEPLOY_ENABLED=true`. Until it is set the job is
   skipped and `main` stays green.
3. Optional but recommended: in the Vercel project open Settings → Deployment
   Checks → add a GitHub check for this workflow. Production promotion then
   waits for the migration instead of racing it.

Migrations run before the new code is promoted in the common case, but the two
are not atomic. Keep every migration backward compatible with the code that is
already deployed, and roll forward with a new migration instead of reverting
schema. If the migration fails, Vercel still holds the deployment when the
Deployment Check is configured.

## 7. Before real trade

Deploy the existing Docker images (`infra/Dockerfile.web`, `infra/Dockerfile.api`,
`infra/docker-compose.yml`) on a host that permits commercial use, restore or
migrate the database, rotate every secret, then point the domains there.
