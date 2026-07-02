-- 004_payments_meta_attribution.sql
-- Meta CAPI attribution fields on payments (server-side + browser Pixel dedup).
-- Idempotent for live DB. See docs/DB-MIGRATIONS.md.

USE `citim_teda_som`;

SET @dbname = DATABASE();

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'meta_fbp') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN meta_fbp VARCHAR(255) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'meta_fbc') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN meta_fbc VARCHAR(255) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'marketing_consent') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN marketing_consent TINYINT(1) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'client_ip') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN client_ip VARCHAR(45) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'client_user_agent') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN client_user_agent VARCHAR(512) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;

SET @preparedStatement = (SELECT IF(
  (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
   WHERE TABLE_SCHEMA = @dbname AND TABLE_NAME = 'payments' AND COLUMN_NAME = 'suppressed_tracking') > 0,
  'SELECT 1',
  'ALTER TABLE payments ADD COLUMN suppressed_tracking TINYINT(1) NULL'
));
PREPARE alterIfNotExists FROM @preparedStatement;
EXECUTE alterIfNotExists;
DEALLOCATE PREPARE alterIfNotExists;
