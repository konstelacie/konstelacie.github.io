# DB Migrations

How to run database migrations for citimtedasom.sk.

## Required env vars

Set in `.env` (or environment):

| Variable | Description |
|----------|-------------|
| `DB_HOST` | MySQL host (default: localhost) |
| `DB_PORT` | MySQL port (default: 3306) |
| `DB_USER` | MySQL user |
| `DB_PASSWORD` | MySQL password |
| `DB_NAME` | Database name (default: citimtedasom) |

## Commands

```bash
# Apply all pending migrations
npm run db:migrate

# Show which migrations are applied vs pending
npm run db:status
```

## Local development

1. Ensure MySQL is running and the database exists.
2. Copy `.env.example` to `.env` and fill in DB credentials.
3. Run `npm run db:migrate`.

## alwaysdata workflow

1. **SSH:** Deploy code, then run `npm run db:migrate` in the app directory.
2. **Admin SQL console:** If you prefer, run migration SQL manually from `src/db/migrations/` in order.

## Safety notes

- **Backup before applying on production.** Use alwaysdata backup or `mysqldump` before running migrations.
- Migrations are idempotent: running twice does nothing (already-applied migrations are skipped).
- On error, the runner stops and exits with a nonzero code.
