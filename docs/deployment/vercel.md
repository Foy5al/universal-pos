# Deploying to Vercel (free, non-commercial)

Two Vercel projects from one repository plus a free Neon Postgres database:

| Project             | Root Directory | Runtime                                  |
| ------------------- | -------------- | ---------------------------------------- |
| `universal-pos-api` | `apps/api`     | one Express function (`api/index.ts`)    |
| `universal-pos-web` | `apps/web`     | Next.js app, proxies `/api/*` to the API |

This is the temporary development target from ADR-0007 and `plan.md` §11. Vercel
Hobby forbids commercial use; a real store needs the Docker/VPS path first.

## 0. Importing the repository

The import screen detects both apps under `apps/` and offers to import them as
standalone projects or to group them into one project with Services. Import them
**as two standalone projects** — one per row in the table above — because the web
rewrite, environment variables and rollback are per app. Do not import the
repository root: it has no framework, so Vercel falls back to `turbo run build`
and then has no output to serve.

If the screen only offers the grouped option, import the repository normally and
set **Root Directory** by hand to `apps/web` or `apps/api` in the project's
settings before the first deploy. Delete any project created at the root.

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

## 2. API project

1. Import the repository, set **Root Directory** to `apps/api`, framework
   preset **Other**. Set `DATABASE_URL` first: `createDefaultDeps()` throws on a
   cold start when it is missing, so every request 500s until it is present.
2. In Settings → Build and Deployment → Root Directory, enable **Include files
   outside of the Root Directory in the Build Step**. The function imports
   `@pos/db`, `@pos/domain` and `@pos/contracts` from `packages/*`; without this
   the build cannot resolve them.
3. Environment variables (Production and Preview):

   ```
   DATABASE_URL=postgresql://...-pooler.../pos?sslmode=require
   DATABASE_POOL_MAX=1
   ```

   `NODE_ENV` is set by Vercel. `SESSION_*`, `STORAGE_*` and `DEMO_*` are only
   read by scripts and future adapters today, not by the deployed API.

4. Deploy, then confirm the function is reachable:

   ```bash
   curl -s https://<api-project>.vercel.app/health
   ```

   `apps/api/vercel.json` rewrites every path to the single function and sets
   `framework: null` so Vercel does not try to detect a framework entrypoint.

## 3. Web project

1. Import the same repository, set **Root Directory** to `apps/web`, framework
   preset **Next.js**.
2. Environment variable:

   ```
   API_PROXY_TARGET=https://<api-project>.vercel.app
   ```

   The `/api/:path*` rewrite in `next.config.ts` is compiled at build time, so
   set this **before** the first build and redeploy the web project whenever the
   API URL changes. `NEXT_PUBLIC_API_BASE_URL` is used as a fallback.

3. Deploy and smoke-test: open the login page, sign in, load the POS, make a
   cash sale, then reload with the network offline and confirm the sale stays in
   the outbox.
4. Preview deployments: the API URL is fixed per environment. Point Preview at
   a stable API alias (or at production) and expect preview web builds to talk
   to it; per-preview API URLs cannot be baked into a rewrite.

## 4. Limits to design around

- Hobby functions are short-lived: no WebSockets, cron daemons, durable queues
  or local files. Queued exports and reconciliation workers need the Docker
  worker from `plan.md` §10.
- Cold starts plus Neon autosuspend (after ~5 idle minutes) make the first
  request slow; the POS must show offline/syncing states while it waits.
- The API function is one bundle. `express.static()` does not serve files on
  Vercel; product images stay in Backblaze B2 through presigned URLs.
- `@node-rs/argon2` ships a platform binary. If a deployment fails with a
  missing `argon2-linux-x64-gnu` module, check the function bundle before
  changing the hashing policy in ADR-0009.
- Report exports are synchronous and bounded (ADR-0021). Large exports must
  become queued jobs before they move here.

## 5. Production migrations from GitHub Actions

`.github/workflows/migrate.yml` applies pending Drizzle migrations to Neon on
every push to `main`. It deliberately does **not** deploy: both Vercel projects
are connected to the repository, so Vercel builds and promotes the commit
itself. Triggering a second deployment from Actions would build the same commit
twice.

1. Repository secret `DATABASE_URL`: the Neon **direct** URL (its host has no
   `-pooler`), so `drizzle-kit migrate` does not run through the pooler.
2. Repository variable `DEPLOY_ENABLED=true`. Until it is set the job is
   skipped and `main` stays green.
3. Optional but recommended: in each Vercel project open Settings → Deployment
   Checks → add a GitHub check for this workflow. Production promotion then
   waits for the migration instead of racing it.

Migrations run before the new code is promoted in the common case, but the two
are not atomic. Keep every migration backward compatible with the code that is
already deployed, and roll forward with a new migration instead of reverting
schema. If the migration fails, Vercel still holds the deployment when the
Deployment Check is configured.

## 6. Before real trade

Deploy the existing Docker images (`infra/Dockerfile.web`, `infra/Dockerfile.api`,
`infra/docker-compose.yml`) on a host that permits commercial use, restore or
migrate the database, rotate every secret, then point the domains there.
