-- 005_capi_send_log.sql
-- Meta Conversions API send log (dedup + audit). Idempotent for live DB. See docs/DB-MIGRATIONS.md.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS capi_send_log (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  event_name VARCHAR(64) NOT NULL,
  event_id VARCHAR(255) NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  status ENUM('pending', 'sent', 'failed', 'skipped') NOT NULL DEFAULT 'pending',
  skip_reason VARCHAR(64) NULL,
  http_status SMALLINT UNSIGNED NULL,
  meta_response JSON NULL,
  error_message TEXT NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  sent_at TIMESTAMP(3) NULL,
  UNIQUE KEY idx_capi_send_log_event (event_name, event_id),
  INDEX idx_capi_send_log_payment (payment_id),
  CONSTRAINT fk_capi_send_log_payment
    FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
