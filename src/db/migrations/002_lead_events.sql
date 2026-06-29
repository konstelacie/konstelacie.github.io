-- 002_lead_events.sql
-- Lead/funnel analytics events (additive; core booking flow must not depend on this).
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS lead_event_types (
  code VARCHAR(64) NOT NULL PRIMARY KEY,
  category ENUM('acquisition', 'engagement', 'post_lead', 'remarketing', 'excluded') NOT NULL,
  description TEXT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS lead_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  event_type VARCHAR(64) NOT NULL,
  form_id VARCHAR(128) NULL,
  source_url VARCHAR(2048) NULL,
  amount DECIMAL(10, 2) NULL,
  currency VARCHAR(3) NULL,
  slot_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  provider_event_id VARCHAR(255) NULL,
  occurred_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  metadata JSON NULL,
  consent_marketing TINYINT(1) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_lead_events_email_time (email, occurred_at),
  INDEX idx_lead_events_type_time (event_type, occurred_at),
  UNIQUE KEY uq_lead_events_provider_event (provider_event_id),
  CONSTRAINT fk_lead_events_type FOREIGN KEY (event_type) REFERENCES lead_event_types (code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- v1 acquisition events (active)
INSERT INTO lead_event_types (code, category, description, is_active) VALUES
  ('email_entered', 'acquisition', 'User submitted email on extend-lock', 1),
  ('lock_extend_failed', 'acquisition', 'Extend-lock failed (expired or invalid lock)', 1),
  ('lock_expired', 'acquisition', 'Slot lock expired without checkout starting', 1),
  ('initiate_checkout', 'acquisition', 'Stripe Checkout session created', 1),
  ('checkout_expired', 'acquisition', 'Stripe Checkout session expired', 1),
  ('payment_failed', 'acquisition', 'Stripe payment intent failed', 1),
  ('payment_retry', 'acquisition', 'Retry of existing pending checkout session', 1),
  ('purchase', 'acquisition', 'Successful payment (checkout completed)', 1),
  ('payment_refunded', 'acquisition', 'Payment refunded', 1)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  description = VALUES(description),
  is_active = VALUES(is_active);

-- Parked for later (inactive — not wired in application code)
INSERT INTO lead_event_types (code, category, description, is_active) VALUES
  ('payment_path_selected', 'acquisition', 'User chose deposit vs full payment', 0),
  ('lock_revoked', 'acquisition', 'User revoked slot lock', 0),
  ('slot_selected', 'acquisition', 'User selected a slot', 0)
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  description = VALUES(description),
  is_active = VALUES(is_active);
