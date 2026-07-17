-- 007_assessment_submissions.sql
-- Life Autopilot Assessment email-unlock submissions.
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md and docs/funnel/it-dev/009-questionnaire-implementation-plan.md §11.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS assessment_submissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  email VARCHAR(255) NOT NULL,
  funnel_name VARCHAR(64) NOT NULL,
  funnel_campaign VARCHAR(64) NULL,
  answers_json JSON NOT NULL,
  scores_json JSON NOT NULL,
  primary_bottleneck VARCHAR(64) NOT NULL,
  secondary_bottleneck VARCHAR(64) NOT NULL,
  source_url VARCHAR(2048) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_assessment_email_created (email, created_at),
  INDEX idx_assessment_funnel_created (funnel_name, created_at),
  INDEX idx_assessment_primary_created (primary_bottleneck, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
