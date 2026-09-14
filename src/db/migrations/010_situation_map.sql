-- 010_situation_map.sql
-- Mapa situácie v0 — structured answers + anonymous funnel events.
-- Idempotent for live DB. See docs/funnel/constellation/002-situation-map-v0.md.

USE `citim_teda_som`;

CREATE TABLE IF NOT EXISTS situation_map_submissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NULL,
  email VARCHAR(255) NOT NULL,
  display_name VARCHAR(80) NOT NULL,
  funnel_name VARCHAR(64) NOT NULL,
  funnel_campaign VARCHAR(64) NULL,
  topic VARCHAR(32) NOT NULL,
  topic_other VARCHAR(200) NULL,
  situation_description TEXT NOT NULL,
  situation_type VARCHAR(32) NOT NULL,
  duration VARCHAR(32) NOT NULL,
  people_involved_json JSON NOT NULL,
  people_involved_other VARCHAR(200) NULL,
  attempts_json JSON NOT NULL,
  attempts_other VARCHAR(200) NULL,
  constellation_experience TINYINT(1) NOT NULL DEFAULT 0,
  desired_change TEXT NOT NULL,
  perceived_barrier VARCHAR(32) NULL,
  perceived_barrier_other VARCHAR(200) NULL,
  source_url VARCHAR(2048) NULL,
  marketing_consent TINYINT(1) NULL,
  marketing_consent_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_smap_email_created (email, created_at),
  INDEX idx_smap_funnel_created (funnel_name, created_at),
  INDEX idx_smap_topic_created (topic, created_at),
  INDEX idx_smap_duration_created (duration, created_at),
  INDEX idx_smap_constellation_created (constellation_experience, created_at),
  INDEX idx_smap_session (session_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS situation_map_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  session_id VARCHAR(64) NOT NULL,
  funnel_name VARCHAR(64) NOT NULL,
  funnel_campaign VARCHAR(64) NULL,
  event_type VARCHAR(64) NOT NULL,
  question_id VARCHAR(16) NULL,
  submission_id BIGINT UNSIGNED NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_smap_ev_session_created (session_id, created_at),
  INDEX idx_smap_ev_type_created (event_type, created_at),
  INDEX idx_smap_ev_question_created (question_id, created_at),
  INDEX idx_smap_ev_funnel_created (funnel_name, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO lead_event_types (code, category, description, is_active) VALUES
  (
    'situation_map_email_submitted',
    'acquisition',
    'Situation map completed and email captured',
    1
  )
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  description = VALUES(description),
  is_active = VALUES(is_active);
