-- 012_situation_map_responses.sql
-- Personal response layer for Mapa situácie. Separate from submissions.
-- Idempotent for live DB. Does not add a paid offer or nurture.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS situation_map_responses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  submission_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'pending',
  ai_summary_draft MEDIUMTEXT NULL,
  ai_summary_prompt_version VARCHAR(64) NULL,
  ai_summary_source VARCHAR(32) NULL,
  human_summary MEDIUMTEXT NULL,
  response_draft MEDIUMTEXT NULL,
  final_response MEDIUMTEXT NULL,
  internal_notes TEXT NULL,
  edited_by VARCHAR(80) NULL,
  reviewed_by VARCHAR(80) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  reviewed_at DATETIME(3) NULL,
  sent_at DATETIME(3) NULL,
  UNIQUE KEY uq_smap_response_submission (submission_id),
  INDEX idx_smap_response_status_created (status, created_at),
  CONSTRAINT fk_smap_response_submission
    FOREIGN KEY (submission_id) REFERENCES situation_map_submissions (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
