# ADR-0011: Object storage adapter

## Status
Accepted

## Date
2026-10-17

## Context
Product images and other media are uploaded and served through the platform. The storage
provider must be replaceable so the development choice (Cloudflare R2) does not become an
architectural dependency, and private objects must not be exposed by default.

## Decision
- Define a `StorageAdapter` interface in `packages/storage` exposing the operations the
  app needs (put, get/sign, delete, presign upload/download, public URL resolution).
- Default implementation targets Cloudflare R2 via its S3-compatible API; S3, MinIO and
  other compatible services are drop-in alternatives.
- Use presigned URLs for uploads and for private downloads; serve public product media
  only through controlled CDN paths.
- Store metadata (org ownership, content type, size, checksum, visibility) in PostgreSQL;
  the object key encodes tenant/store scope.
- No business logic imports a provider SDK directly; only the adapter does.

## Alternatives Considered

### Direct Cloudflare R2 SDK calls throughout
- Pros: least code.
- Cons: provider lock-in for non-commercial reasons; hard to test and migrate.
- Rejected.

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
