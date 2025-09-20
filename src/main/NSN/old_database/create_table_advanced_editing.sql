-- Appeal system data table migration script
-- Execute this script to add appeal functionality to the existing database

USE comp639_project1;

SET FOREIGN_KEY_CHECKS=0;
-- Create journey report table
CREATE TABLE IF NOT EXISTS journey_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    journey_id INT NOT NULL,
    reporter_id INT NOT NULL COMMENT 'User ID of the reporter',
    reason ENUM('spam', 'inappropriate_content', 'false_information', 'copyright_violation', 'offensive_language', 'other') NOT NULL COMMENT 'Report reason',
    details TEXT NOT NULL COMMENT 'Detailed explanation (required, minimum 10 characters)',
    status ENUM('pending', 'reviewed', 'dismissed', 'hidden') DEFAULT 'pending' COMMENT 'Report status',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT DEFAULT NULL COMMENT 'Admin/editor ID who processed the report',
    admin_response TEXT DEFAULT NULL COMMENT 'Admin response',

    FOREIGN KEY (journey_id) REFERENCES journeys(journey_id) ON DELETE CASCADE,
    FOREIGN KEY (reporter_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,

    INDEX idx_journey_id (journey_id),
    INDEX idx_reporter_id (reporter_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),

    -- Prevent the same user from reporting the same journey repeatedly
    UNIQUE KEY unique_report (journey_id, reporter_id)
);

SET FOREIGN_KEY_CHECKS=1;

-- Verify table structure
SELECT 'journey_reports table structure:' as info;
DESCRIBE journey_reports;
-- Create appeals table
CREATE TABLE IF NOT EXISTS appeals (
    appeal_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    appeal_type ENUM('hidden_journey', 'sharing_block', 'site_ban') NOT NULL,
    reference_id INT DEFAULT NULL COMMENT 'Related ID: journey_id for hidden_journey, NULL for other cases',
    justification TEXT NOT NULL COMMENT 'Appeal reason (required, minimum 20 characters)',
    status ENUM('pending', 'approved', 'rejected') DEFAULT 'pending',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT DEFAULT NULL COMMENT 'Admin/editor ID who processed the appeal',
    admin_response TEXT DEFAULT NULL COMMENT 'Admin response',

    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL,

    INDEX idx_user_id (user_id),
    INDEX idx_status (status),
    INDEX idx_created_at (created_at),
    INDEX idx_appeal_type (appeal_type)
);

-- Add sharing_blocked field to users table (compatible with existing data)
SET @column_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                      WHERE TABLE_SCHEMA = 'create_table_v_04'
                      AND TABLE_NAME = 'users'
                      AND COLUMN_NAME = 'sharing_blocked');

SET @sql = IF(@column_exists = 0,
    'ALTER TABLE users ADD COLUMN sharing_blocked BOOLEAN DEFAULT FALSE COMMENT "Whether the user is blocked from sharing content"',
    'SELECT "sharing_blocked column already exists" as message');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;

-- Verify migration results
SELECT 'appeals table structure:' as info;
DESCRIBE appeals;

SELECT 'users table new field confirmation:' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'create_table_v_04'
AND TABLE_NAME = 'users'
AND COLUMN_NAME = 'sharing_blocked';


-- Edit log system data table migration script
-- Execute this script to add edit log functionality to the existing database
-- Corrected version - matches populate.py data

SET FOREIGN_KEY_CHECKS=0;

-- Create edit log table
CREATE TABLE IF NOT EXISTS edit_logs (
    log_id INT AUTO_INCREMENT PRIMARY KEY,
    journey_id INT NOT NULL,
    event_id INT NULL,  -- Fill in if it's an event edit, NULL for journey edits
    editor_id INT NOT NULL,
    edit_type ENUM('journey_edit', 'event_edit') NOT NULL,
    field_changed VARCHAR(100) NOT NULL,  -- Name of the modified field
    old_value TEXT,  -- Original value
    new_value TEXT,  -- New value
    edit_reason TEXT NOT NULL,  -- Edit reason (required, minimum 10 characters)
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (journey_id) REFERENCES journeys(journey_id) ON DELETE CASCADE,
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (editor_id) REFERENCES users(user_id) ON DELETE CASCADE,

    INDEX idx_journey_id (journey_id),
    INDEX idx_event_id (event_id),
    INDEX idx_editor_id (editor_id),
    INDEX idx_edit_type (edit_type),
    INDEX idx_created_at (created_at)
);

-- Add edit control fields to journeys table (compatible with all MySQL versions)
-- Check if no_edits_flag column exists
SET @column_exists_flag = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                          WHERE TABLE_SCHEMA = 'create_table_v_04'
                          AND TABLE_NAME = 'journeys'
                          AND COLUMN_NAME = 'no_edits_flag');

SET @sql_flag = IF(@column_exists_flag = 0,
    'ALTER TABLE journeys ADD COLUMN no_edits_flag BOOLEAN DEFAULT FALSE COMMENT "Edit prohibition flag"',
    'SELECT "no_edits_flag column already exists" as message');

PREPARE stmt FROM @sql_flag;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check if no_edits_set_at column exists
SET @column_exists_at = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = 'create_table_v_04'
                        AND TABLE_NAME = 'journeys'
                        AND COLUMN_NAME = 'no_edits_set_at');

SET @sql_at = IF(@column_exists_at = 0,
    'ALTER TABLE journeys ADD COLUMN no_edits_set_at TIMESTAMP NULL COMMENT "Time when edit prohibition was set"',
    'SELECT "no_edits_set_at column already exists" as message');

PREPARE stmt FROM @sql_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check if no_edits_set_by column exists
SET @column_exists_by = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                        WHERE TABLE_SCHEMA = 'create_table_v_04'
                        AND TABLE_NAME = 'journeys'
                        AND COLUMN_NAME = 'no_edits_set_by');

SET @sql_by = IF(@column_exists_by = 0,
    'ALTER TABLE journeys ADD COLUMN no_edits_set_by INT NULL COMMENT "User ID who set the edit prohibition"',
    'SELECT "no_edits_set_by column already exists" as message');

PREPARE stmt FROM @sql_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint (if it doesn't exist)
SET @fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                  WHERE TABLE_SCHEMA = 'create_table_v_04'
                  AND TABLE_NAME = 'journeys'
                  AND CONSTRAINT_NAME = 'fk_no_edits_set_by');

SET @sql_fk = IF(@fk_exists = 0,
    'ALTER TABLE journeys ADD CONSTRAINT fk_no_edits_set_by FOREIGN KEY (no_edits_set_by) REFERENCES users(user_id) ON DELETE SET NULL',
    'SELECT "Foreign key constraint fk_no_edits_set_by already exists" as message');

PREPARE stmt FROM @sql_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add edit control fields to events table
SET @events_column_exists_flag = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                                 WHERE TABLE_SCHEMA = 'create_table_v_04'
                                 AND TABLE_NAME = 'events'
                                 AND COLUMN_NAME = 'no_edits_flag');

SET @events_sql_flag = IF(@events_column_exists_flag = 0,
    'ALTER TABLE events ADD COLUMN no_edits_flag BOOLEAN DEFAULT FALSE COMMENT "Edit prohibition flag"',
    'SELECT "no_edits_flag column already exists in events table" as message');

PREPARE stmt FROM @events_sql_flag;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add no_edits_set_at column to events table
SET @events_column_exists_at = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                               WHERE TABLE_SCHEMA = 'create_table_v_04'
                               AND TABLE_NAME = 'events'
                               AND COLUMN_NAME = 'no_edits_set_at');

SET @events_sql_at = IF(@events_column_exists_at = 0,
    'ALTER TABLE events ADD COLUMN no_edits_set_at TIMESTAMP NULL COMMENT "Time when edit prohibition was set"',
    'SELECT "no_edits_set_at column already exists in events table" as message');

PREPARE stmt FROM @events_sql_at;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add no_edits_set_by column to events table
SET @events_column_exists_by = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS
                               WHERE TABLE_SCHEMA = 'create_table_v_04'
                               AND TABLE_NAME = 'events'
                               AND COLUMN_NAME = 'no_edits_set_by');

SET @events_sql_by = IF(@events_column_exists_by = 0,
    'ALTER TABLE events ADD COLUMN no_edits_set_by INT NULL COMMENT "User ID who set the edit prohibition"',
    'SELECT "no_edits_set_by column already exists in events table" as message');

PREPARE stmt FROM @events_sql_by;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Add foreign key constraint to events table (if it doesn't exist)
SET @events_fk_exists = (SELECT COUNT(*) FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
                        WHERE TABLE_SCHEMA = 'create_table_v_04'
                        AND TABLE_NAME = 'events'
                        AND CONSTRAINT_NAME = 'fk_events_no_edits_set_by');

SET @events_sql_fk = IF(@events_fk_exists = 0,
    'ALTER TABLE events ADD CONSTRAINT fk_events_no_edits_set_by FOREIGN KEY (no_edits_set_by) REFERENCES users(user_id) ON DELETE SET NULL',
    'SELECT "Foreign key constraint fk_events_no_edits_set_by already exists" as message');

PREPARE stmt FROM @events_sql_fk;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET FOREIGN_KEY_CHECKS=1;

-- Verify migration results
SELECT 'edit_logs table structure:' as info;
DESCRIBE edit_logs;

SELECT 'journeys table new fields confirmation:' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'create_table_v_04'
AND TABLE_NAME = 'journeys'
AND COLUMN_NAME IN ('no_edits_flag', 'no_edits_set_at', 'no_edits_set_by');

SELECT 'events table new fields confirmation:' as info;
SELECT COLUMN_NAME, COLUMN_TYPE, COLUMN_DEFAULT, COLUMN_COMMENT
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_SCHEMA = 'create_table_v_04'
AND TABLE_NAME = 'events'
AND COLUMN_NAME IN ('no_edits_flag', 'no_edits_set_at', 'no_edits_set_by');

-- Display success message
SELECT 'edit_logs system migration completed!' as status;