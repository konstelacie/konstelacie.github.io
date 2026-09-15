-- 011_situation_map_v01.sql
-- Mapa situácie v0.1 — versioned marketing consent + richer funnel event properties.
-- Idempotent for live DB. Does not add a product/offer onto submissions.

USE `citim_teda_som`;

SET @dbname = DATABASE();

-- Consent copy version shown at submit (independent of email capture).
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'situation_map_submissions'
     AND COLUMN_NAME = 'marketing_consent_version') > 0,
  'SELECT 1',
  'ALTER TABLE situation_map_submissions ADD COLUMN marketing_consent_version VARCHAR(64) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Screen index among enabled questions (1-based). question_id stays the stable identity.
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'situation_map_events'
     AND COLUMN_NAME = 'step_number') > 0,
  'SELECT 1',
  'ALTER TABLE situation_map_events ADD COLUMN step_number TINYINT UNSIGNED NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

-- Allowlisted extras (answered, answerLengthBucket, offerId, offerVariant). Never store free text.
SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'situation_map_events'
     AND COLUMN_NAME = 'properties_json') > 0,
  'SELECT 1',
  'ALTER TABLE situation_map_events ADD COLUMN properties_json JSON NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
