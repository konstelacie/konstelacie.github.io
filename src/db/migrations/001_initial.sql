-- 001_initial.sql
-- Minimal schema for citimtedasom.sk (Phase 2A)
-- MySQL 8+ compatible, utf8mb4, UTC timestamps

-- Ensure database exists
CREATE DATABASE IF NOT EXISTS `citim_teda_som`
  DEFAULT CHARACTER SET utf8mb4
  DEFAULT COLLATE utf8mb4_unicode_ci;

USE `citim_teda_som`;

-- schema_migrations: tracks applied migrations (runner creates first; IF NOT EXISTS for idempotency)
CREATE TABLE IF NOT EXISTS schema_migrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  filename VARCHAR(255) NOT NULL UNIQUE,
  applied_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- users: identity by email
CREATE TABLE users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- slots: bookable time slots (admin-created)
-- Business coordinates: local_date + grid_index (0..4); instants: start_at_utc / end_at_utc (UTC)
CREATE TABLE slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  local_date DATE NOT NULL,
  grid_index TINYINT UNSIGNED NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Bratislava',
  start_at_utc DATETIME(3) NOT NULL,
  end_at_utc DATETIME(3) NOT NULL,
  status ENUM('open','blocked','cancelled') NOT NULL DEFAULT 'open',
  capacity INT NOT NULL DEFAULT 1,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_slots_cell (local_date, grid_index),
  INDEX idx_slots_local_date (local_date),
  INDEX idx_slots_start_utc (start_at_utc),
  INDEX idx_slots_status_start (status, start_at_utc)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- slot_locks: time-limited holds (short lock before email; extended after email — see API)
CREATE TABLE slot_locks (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slot_id BIGINT UNSIGNED NOT NULL,
  lock_token CHAR(36) NOT NULL UNIQUE,
  email VARCHAR(255) NULL,
  expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_slot_locks_slot_id (slot_id),
  INDEX idx_slot_locks_expires (expires_at),
  CONSTRAINT fk_slot_locks_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- slot_lock_challenges: capability tokens for POST /slots/:id/lock (Phase 2 security; short TTL, single-use)
CREATE TABLE slot_lock_challenges (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slot_id BIGINT UNSIGNED NOT NULL,
  challenge_token VARCHAR(128) NOT NULL,
  expires_at DATETIME(3) NOT NULL,
  used_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_challenge_token (challenge_token),
  INDEX idx_challenge_slot_expires (slot_id, expires_at),
  CONSTRAINT fk_challenge_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- reservations: created after lock, before payment
CREATE TABLE reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  slot_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NULL,
  email VARCHAR(255) NOT NULL,
  billing_name VARCHAR(255) NOT NULL DEFAULT '',
  billing_is_company TINYINT(1) NOT NULL DEFAULT 0,
  billing_company_name VARCHAR(255) NULL,
  billing_ico VARCHAR(20) NULL,
  billing_dic VARCHAR(20) NULL,
  billing_ic_dph VARCHAR(20) NULL,
  billing_street VARCHAR(255) NULL,
  billing_city VARCHAR(100) NULL,
  billing_post_code VARCHAR(20) NULL,
  billing_country CHAR(2) NULL DEFAULT 'SK',
  status ENUM('draft','pending_payment','confirmed','cancelled','expired') NOT NULL DEFAULT 'draft',
  payment_type ENUM('deposit','full') NOT NULL DEFAULT 'deposit',
  lock_token CHAR(36) NULL,
  funnel_name VARCHAR(32) NULL,
  funnel_campaign VARCHAR(64) NULL,
  funnel_video_id VARCHAR(128) NULL,
  admin_note TEXT NULL,
  cancelled_at DATETIME(3) NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_reservations_email_created (email, created_at),
  INDEX idx_reservations_slot_id (slot_id),
  INDEX idx_reservations_status_created (status, created_at),
  INDEX idx_reservations_funnel_created (funnel_name, funnel_campaign, created_at),
  CONSTRAINT fk_reservations_slot FOREIGN KEY (slot_id) REFERENCES slots(id),
  CONSTRAINT fk_reservations_user FOREIGN KEY (user_id) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- payments: Stripe Checkout integration (provider_ref = cs_... for Stripe; UNIQUE for V1)
CREATE TABLE payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  reservation_id BIGINT UNSIGNED NULL,
  slot_id BIGINT UNSIGNED NULL,
  provider ENUM('none','stripe') NOT NULL DEFAULT 'none',
  provider_ref VARCHAR(255) NULL,
  payment_type ENUM('deposit','session','topup') NOT NULL,
  amount_cents INT NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'eur',
  status ENUM('pending','completed','failed','expired','refunded') NOT NULL DEFAULT 'pending',
  paid_at DATETIME(3) NULL,
  checkout_expires_at DATETIME(3) NOT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX idx_payments_reservation (reservation_id),
  INDEX idx_payments_slot_pending (slot_id, status),
  INDEX idx_payments_user (user_id),
  INDEX idx_payments_provider_ref (provider, provider_ref),
  UNIQUE INDEX idx_payments_stripe_session (provider_ref),
  INDEX idx_payments_status_created (status, created_at),
  CONSTRAINT fk_payments_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_payments_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_payments_slot FOREIGN KEY (slot_id) REFERENCES slots(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- billing_documents: internal invoicing layer (Phase 1: record on payment only; PDF/email later)
CREATE TABLE billing_documents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_number VARCHAR(64) NULL,
  internal_type ENUM('deposit','full','topup','final','correction','refund') NOT NULL,
  status ENUM('recorded','issued','void','superseded') NOT NULL DEFAULT 'recorded',
  document_type ENUM('advance','settlement','standard') NOT NULL DEFAULT 'standard',
  user_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(255) NOT NULL DEFAULT '',
  customer_is_company TINYINT(1) NOT NULL DEFAULT 0,
  customer_company_name VARCHAR(255) NULL,
  customer_ico VARCHAR(20) NULL,
  customer_dic VARCHAR(20) NULL,
  customer_ic_dph VARCHAR(20) NULL,
  customer_street VARCHAR(255) NULL,
  customer_city VARCHAR(100) NULL,
  customer_post_code VARCHAR(20) NULL,
  customer_country CHAR(2) NOT NULL DEFAULT 'SK',
  supplier_iban VARCHAR(50) NOT NULL DEFAULT '',
  supplier_swift VARCHAR(20) NOT NULL DEFAULT '',
  customer_email_snapshot VARCHAR(255) NOT NULL,
  customer_name_snapshot VARCHAR(255) NULL,
  reservation_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NOT NULL,
  advance_document_id BIGINT UNSIGNED NULL,
  stripe_checkout_session_id VARCHAR(255) NOT NULL,
  stripe_payment_intent_id VARCHAR(255) NULL,
  stripe_charge_id VARCHAR(255) NULL,
  currency CHAR(3) NOT NULL DEFAULT 'eur',
  amount_net_cents INT NOT NULL,
  amount_vat_cents INT NOT NULL,
  amount_gross_cents INT NOT NULL,
  vat_rate DECIMAL(6,5) NOT NULL,
  issue_date DATE NOT NULL,
  due_date DATE NOT NULL,
  delivery_date DATE NOT NULL,
  kros_external_id CHAR(36) UNIQUE NULL,
  kros_document_id VARCHAR(50) UNIQUE NULL,
  kros_numbering_sequence VARCHAR(20) NOT NULL DEFAULT 'OF',
  variable_symbol VARCHAR(20) NULL,
  vat_payer_type TINYINT NOT NULL DEFAULT 1,
  kros_status ENUM('pending','accepted','failed','webhook_received') NULL,
  kros_download_url VARCHAR(500) NULL,
  kros_webhook_received_at DATETIME(3) NULL,
  kros_payload_json JSON NULL,
  kros_response_json JSON NULL,
  kros_last_error TEXT NULL,
  issued_at DATETIME(3) NULL,
  paid_at DATETIME(3) NULL,
  refunded_at DATETIME(3) NULL,
  related_document_id BIGINT UNSIGNED NULL,
  pdf_storage_ref VARCHAR(512) NULL,
  pdf_generated_at DATETIME(3) NULL,
  email_sent_at DATETIME(3) NULL,
  email_message_id VARCHAR(255) NULL,
  metadata JSON NULL,
  notes TEXT NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_billing_documents_payment (payment_id),
  INDEX idx_billing_documents_created (created_at),
  INDEX idx_billing_documents_stripe_session (stripe_checkout_session_id),
  CONSTRAINT fk_billing_documents_user FOREIGN KEY (user_id) REFERENCES users(id),
  CONSTRAINT fk_billing_documents_reservation FOREIGN KEY (reservation_id) REFERENCES reservations(id),
  CONSTRAINT fk_billing_documents_payment FOREIGN KEY (payment_id) REFERENCES payments(id),
  CONSTRAINT fk_billing_documents_advance FOREIGN KEY (advance_document_id) REFERENCES billing_documents(id),
  CONSTRAINT fk_billing_documents_related FOREIGN KEY (related_document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE billing_document_lines (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  billing_document_id BIGINT UNSIGNED NOT NULL,
  line_no TINYINT UNSIGNED NOT NULL DEFAULT 1,
  name VARCHAR(255) NOT NULL,
  description VARCHAR(500) NULL,
  amount DECIMAL(10,4) NOT NULL DEFAULT 1,
  measure_unit VARCHAR(20) NOT NULL DEFAULT 'ks',
  vat_rate DECIMAL(5,2) NOT NULL,
  unit_price_excl_vat_cents INT NOT NULL,
  total_price_incl_vat_cents INT NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  FOREIGN KEY (billing_document_id) REFERENCES billing_documents(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- billing_document_counters: yearly sequence for document_number (see billingDeliveryService)
CREATE TABLE billing_document_counters (
  scope_year SMALLINT UNSIGNED NOT NULL PRIMARY KEY,
  next_seq INT UNSIGNED NOT NULL DEFAULT 1,
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- webhook_events: idempotency for Stripe webhooks (evt_...)
CREATE TABLE webhook_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  stripe_event_id VARCHAR(255) NOT NULL UNIQUE,
  processed_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- email_sent_log: audit trail for transactional emails (see docs/EMAILING.md)
CREATE TABLE email_sent_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  recipient_email VARCHAR(255) NOT NULL,
  template_id VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  provider_message_id VARCHAR(255) NULL,
  actor_type ENUM('anon','user','admin','system') NOT NULL DEFAULT 'system',
  actor_id BIGINT UNSIGNED NULL,
  sent_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_email_sent_log_recipient (recipient_email),
  INDEX idx_email_sent_log_entity (entity_type, entity_id),
  INDEX idx_email_sent_log_sent_at (sent_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- system_alerts: persistent admin alerts (payment/billing/email safety)
CREATE TABLE system_alerts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  severity ENUM('info','warning','critical') NOT NULL DEFAULT 'critical',
  type VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  status ENUM('open','acknowledged','resolved') NOT NULL DEFAULT 'open',
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  acknowledged_at DATETIME(3) NULL,
  acknowledged_by BIGINT UNSIGNED NULL,
  resolved_at DATETIME(3) NULL,
  resolved_by BIGINT UNSIGNED NULL,
  metadata_json JSON NULL,
  INDEX idx_system_alerts_status_severity (status, severity),
  INDEX idx_system_alerts_type_entity (type, entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- audit_logs: minimal
CREATE TABLE audit_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  actor_type ENUM('anon','user','admin','system') NOT NULL DEFAULT 'system',
  actor_id BIGINT UNSIGNED NULL,
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50) NULL,
  entity_id BIGINT UNSIGNED NULL,
  ip VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  payload_json JSON NULL,
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_audit_logs_action_created (action, created_at),
  INDEX idx_audit_logs_entity (entity_type, entity_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
