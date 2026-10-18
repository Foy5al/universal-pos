# ADR-0011: Object storage adapter

## Status
Accepted

## Date
2026-10-17

## Context
Product images and other media are uploaded and served through the platform. The storage
provider must be replaceable so the development choice does not become an architectural
dependency, private objects must not be exposed by default, and the development provider
must not require a credit card (the project has no payment method available).

## Decision
- Define a `StorageAdapter` interface in `packages/storage` exposing the operations the
  app needs (put, get/sign, delete, presign upload/download, public URL resolution).
- Default implementation targets Backblaze B2 via its S3-compatible API (10 GB free, no
  card required at signup); MinIO is the local/Docker option and S3, Cloudflare R2 and
  other compatible services are drop-in alternatives.
- Use presigned URLs for uploads and for private downloads; serve public product media
  only through controlled CDN paths.
- Store metadata (org ownership, content type, size, checksum, visibility) in PostgreSQL;
  the object key encodes tenant/store scope.
- No business logic imports a provider SDK directly; only the adapter does.

## Revisions
- 2026-10-18: Default development provider changed from Cloudflare R2 to Backblaze B2.
  R2 requires a payment method at account creation; B2 gives the same 10 GB free
  allowance through an S3-compatible API with no card, so this stays inside the accepted
  adapter decision instead of replacing it. Filebase (5 GB) and Tigris (5 GB) are listed
  as additional no-card alternatives.

## Alternatives Considered

### Direct Cloudflare R2 SDK calls throughout
- Pros: least code.
- Cons: provider lock-in for non-commercial reasons; hard to test and migrate.
- Rejected.

### Cloudflare R2 as the default provider
- Pros: 10 GB free storage with zero egress fees.
- Cons: signup requires a payment method, which the project cannot provide; would block
  local and pilot development. Superseded by Backblaze B2 above.

### Store binaries in PostgreSQL (bytea/large objects)
- Pros: one datastore, transactional with rows.
- Cons: database bloat, backup/restore cost, poor CDN/streaming story.
- Rejected for product media.

### Local filesystem storage
- Pros: fine for a single dev machine.
- Cons: incompatible with serverless/dev deploys and horizontal scaling; not durable.
- Rejected except as a local/dev adapter behind the same interface.

## Consequences
- Migrating storage providers is an adapter/config change, not a code rewrite.
- Media access is tenant-scoped and auditable like any other resource (ADR-0001, ADR-0002).
- Storage credentials are server-side only; clients receive presigned URLs, never keys.
