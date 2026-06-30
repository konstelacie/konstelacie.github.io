-- 003_lead_event_types_active.sql
-- Activate lead event types wired in application code (see api/payments, api/revoke).
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md.

USE `citim_teda_som`;

UPDATE lead_event_types
SET is_active = 1
WHERE code IN ('payment_path_selected', 'lock_revoked');
