# DB Migrations

How to run database migrations for citimtedasom.sk. For schema structure, tables, and relationships, see `docs/DB-SCHEMA.md`. For env usage across the app (including when the DB pool is disabled), see `docs/IMPLEMENTATION-SNAPSHOT.md`.

## Required env vars

Set in `.env` (or environment). Copy from `.env.example` at the repo root.

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (default: localhost) |
| `DB_PORT` | MySQL port (default: 3306) |
| `DB_USER` | MySQL user (**required** for `yarn db:migrate` and for the app pool) |
| `DB_PASSWORD` | MySQL password (may be empty) |
| `DB_NAME` | Database name (default: `citim_teda_som`) |

**Migration runner (`scripts/db-migrate.js`):** Exits with an error if `DB_USER` or `DB_NAME` is missing.

**Application pool (`src/config/database.js`):** The pool is **not** created unless `DB_HOST`, `DB_USER`, and `DB_NAME` are all set (non-empty). If the pool is missing, API routes that need the DB return **503** where applicable.

For Stripe vars (`STRIPE_*_TEST`, `STRIPE_*_PROD`), see `docs/STRIPE-ARCHITECTURE.md` and `docs/PAGE-VISIBILITY.md`. For Resend (`RESEND_API_KEY`, `RESEND_FROM_EMAIL`, `RESEND_FROM_NAME`), see `docs/EMAILING.md`. For **billing / invoicing** env (`BILLING_PDF_STORAGE_DIR`, `BILLING_SEND_INVOICE_EMAIL`, supplier fields, etc.), see `docs/STRIPE-ARCHITECTURE.md` (Billing / invoice env) and `src/config/index.js` (`billing`).

## How it works

The migration runner (`scripts/db-migrate.js`) uses a **schema_migrations** table to track which migration files have already been applied. This makes runs idempotent: you can run `yarn db:migrate` multiple times safely—already-applied files are skipped.

| Component | Purpose |
|-----------|---------|
| `schema_migrations` table | Stores `filename` of each applied migration and `applied_at` timestamp |
| `ensureSchemaMigrations()` | Creates the table on first run (IF NOT EXISTS) |
| Runner logic | Reads applied filenames, runs only pending `.sql` files, then records each |

**Do not modify** the migration infra (`scripts/db-migrate.js`, `schema_migrations` table in `001_initial.sql`) without explicit human approval. See project rules. You may suggest changes but must not apply them automatically.

## Commands

```bash
# Apply all pending migrations
yarn db:migrate

# Show which migrations are applied vs pending
yarn db:status
```

## Local development

1. Ensure MySQL is running and the database exists.
2. Copy `.env.example` to `.env` and fill in DB credentials.
3. Run `yarn db:migrate`.

## alwaysdata workflow

1. **SSH:** Deploy code, then run `yarn db:migrate` in the app directory.
2. **Admin SQL console:** If you prefer, run migration SQL manually from `src/db/migrations/` in order.

Broader production setup (security env, cron, Stripe, verification checklist) is in **`docs/DEPLOY-ALWAYSDATA.md`** (for go-live; we are not on prod yet).

## Billing PDF storage (after migrate)

Migrations create **`billing_documents`** / **`billing_document_counters`** only — not the filesystem for generated PDFs.

- **Default directory:** `{project root}/storage/billing-pdfs/`. The app creates this when writing PDFs; ensure the **process can write** there on the host (permissions, persistent volume if the app dir is read-only or ephemeral).
- **Override:** set **`BILLING_PDF_STORAGE_DIR`** to an absolute path on the server (see `src/services/billingDeliveryService.js`).
- **DB:** `billing_documents.pdf_storage_ref` stores a path such as `storage/billing-pdfs/…` (or the custom prefix) so the same volume must remain available for **admin regenerate** and **invoice email** attachment reads.

Do not treat PDFs as disposable cache on production unless you accept broken “resend” and detail views until regeneration.

## Safety notes

- **Backup before applying on production.** Use alwaysdata backup or `mysqldump` before running migrations.
- Migrations are idempotent: running twice does nothing (already-applied migrations are skipped).
- On error, the runner stops and exits with a nonzero code.
