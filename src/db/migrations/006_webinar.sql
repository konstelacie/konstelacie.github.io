-- 006_webinar.sql
-- Evergreen webinar registrations (scheduling + synced playback room).
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS webinar_registrations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  start_at_utc DATETIME(3) NOT NULL,
  end_at_utc DATETIME(3) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Europe/Bratislava',
  access_token CHAR(36) NOT NULL,
  status ENUM('registered', 'cancelled') NOT NULL DEFAULT 'registered',
  selection_type ENUM('earliest', 'preset', 'custom') NOT NULL,
  selection_key VARCHAR(128) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_webinar_access_token (access_token),
  UNIQUE KEY uq_webinar_email_start (email, start_at_utc),
  INDEX idx_webinar_start_status (start_at_utc, status),
  INDEX idx_webinar_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
