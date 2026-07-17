-- 008_assessment_lead_event.sql
-- Primary KPI for Life Autopilot Assessment funnel (email unlock).
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md and docs/leads/assessment-conversion-events.md.

USE `citim_teda_som`;

INSERT INTO lead_event_types (code, category, description, is_active) VALUES
  (
    'assessment_email_unlocked',
    'acquisition',
    'Assessment completed and results unlocked with email',
    1
  )
ON DUPLICATE KEY UPDATE
  category = VALUES(category),
  description = VALUES(description),
  is_active = VALUES(is_active);
