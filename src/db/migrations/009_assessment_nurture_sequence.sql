-- 009_assessment_nurture_sequence.sql
-- Post-assessment marketing nurture: consent, sequence enrollments, lead event types.
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md, docs/funnel/it-dev/023-email-architecture.md.

USE `citim_teda_som`;

-- ---------------------------------------------------------------------------
-- marketing_consents: source of truth for marketing email eligibility
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS marketing_consents (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  consent_granted TINYINT(1) NOT NULL DEFAULT 0,
  consent_source VARCHAR(64) NULL,
  consented_at DATETIME(3) NULL,
  withdrawn_at DATETIME(3) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_marketing_consents_email (email),
  INDEX idx_marketing_consents_granted (consent_granted, updated_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- assessment_submissions: persist consent snapshot at unlock time
-- ---------------------------------------------------------------------------
SET @dbname = DATABASE();

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'assessment_submissions'
     AND COLUMN_NAME = 'marketing_consent') > 0,
  'SELECT 1',
  'ALTER TABLE assessment_submissions ADD COLUMN marketing_consent TINYINT(1) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'assessment_submissions'
     AND COLUMN_NAME = 'marketing_consent_at') > 0,
  'SELECT 1',
  'ALTER TABLE assessment_submissions ADD COLUMN marketing_consent_at DATETIME(3) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'assessment_submissions'
     AND COLUMN_NAME = 'marketing_consent_source') > 0,
  'SELECT 1',
  'ALTER TABLE assessment_submissions ADD COLUMN marketing_consent_source VARCHAR(64) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- ---------------------------------------------------------------------------
-- email_sequence_enrollments: progression state (not inferred from send logs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_sequence_enrollments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sequence_name VARCHAR(64) NOT NULL,
  email VARCHAR(255) NOT NULL,
  assessment_submission_id BIGINT UNSIGNED NOT NULL,
  current_step TINYINT UNSIGNED NOT NULL DEFAULT 0 COMMENT 'Last successfully sent step (0 = none)',
  status ENUM('ACTIVE','PAUSED','COMPLETED','UNSUBSCRIBED','CANCELLED') NOT NULL DEFAULT 'ACTIVE',
  enrolled_at DATETIME(3) NOT NULL,
  last_sent_at DATETIME(3) NULL,
  next_send_at DATETIME(3) NULL,
  completed_at DATETIME(3) NULL,
  unsubscribed_at DATETIME(3) NULL,
  cancelled_at DATETIME(3) NULL,
  primary_bottleneck VARCHAR(64) NULL,
  secondary_bottleneck VARCHAR(64) NULL,
  is_dual_primary TINYINT(1) NOT NULL DEFAULT 0,
  is_balanced TINYINT(1) NOT NULL DEFAULT 0,
  is_low_overall TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_email_sequence_name_email (sequence_name, email),
  INDEX idx_email_seq_due (status, next_send_at),
  INDEX idx_email_seq_submission (assessment_submission_id),
  INDEX idx_email_seq_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Lead event types for nurture analytics
-- ---------------------------------------------------------------------------
INSERT INTO lead_event_types (code, category, description, is_active) VALUES
  (
    'sequence_enrolled',
    'engagement',
    'Participant enrolled into a marketing email sequence',
    1
  ),
  (
    'email_sent',
    'engagement',
    'Marketing sequence email accepted by provider',
    1
  ),
  (
    'sequence_completed',
    'engagement',
    'Marketing email sequence finished all steps',
    1
  ),
  (
    'sequence_unsubscribed',
    'engagement',
    'Participant unsubscribed from marketing email sequence',
    1
  )
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  description = VALUES(description),
  is_active = VALUES(is_active);
