drop database if exists comp639_project2;
create database comp639_project2;
use comp639_project2;

SET FOREIGN_KEY_CHECKS=0;

CREATE TABLE IF NOT EXISTS locations (
    location_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of locations',
    country VARCHAR(50) DEFAULT NULL comment 'The country of location, not null',
    region VARCHAR(50) DEFAULT NULL comment 'The region of location, could be null',
    city VARCHAR(50) DEFAULT NULL comment 'The city of location, could be null',
    address VARCHAR(100) DEFAULT NULL comment 'The specific address of location, could be null',
    PRIMARY KEY (`location_id`)
);

CREATE TABLE IF NOT EXISTS users (
    user_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of users',
    username VARCHAR(20) NOT NULL comment 'The username for login, not null',
    password_hash CHAR(60) NOT NULL comment 'The password_hash for login, not null',
    email VARCHAR(320) NOT NULL comment 'The email for registeration, not null',
    first_name VARCHAR(50) DEFAULT NULL comment 'The first_name for user_profile, default null',
    last_name VARCHAR(50) DEFAULT NULL comment 'The last_name for user_profile, default null',
    location_id INT DEFAULT NULL comment 'The city for user_profile, default null',
    description VARCHAR(255) DEFAULT NULL comment 'The biography for user_profile, could be null',
    profile_image VARCHAR(255) DEFAULT NULL comment 'The user avatar for user_profile, could be null',
    role ENUM('admin','editor','traveller') NOT NULL DEFAULT 'traveller' comment 'The role for authorization, not null',
    status ENUM('active','inactive','banned') NOT NULL DEFAULT 'active' comment 'The status for login and sharing, not null',
    PRIMARY KEY (`user_id`),
    UNIQUE KEY `username` (`username`),
    UNIQUE KEY `email` (`email`),
	CONSTRAINT fk_location_id_in_users FOREIGN KEY (location_id)
        REFERENCES locations (location_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS journeys(
	journey_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of journeys',
	user_id INT NOT NULL comment 'Forign key, not null',
	title VARCHAR(100) NOT NULL comment 'The title of journey, not null',
	description TEXT DEFAULT NULL comment 'The description of journey, not null',
	start_date TIMESTAMP NOT NULL DEFAULT NOW() comment 'The start_date of journey, not null',
    display ENUM('public','private','onlyfriends') NOT NULL DEFAULT 'private' comment 'The display mode of journey, not null',
	status ENUM('open','hidden')NOT NULL DEFAULT 'open' comment 'The status of journey, not null',
	created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP comment 'Automatically generated and updated time',
    PRIMARY KEY (`journey_id`),
	CONSTRAINT fk_user_id_in_journeys FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS events(
	event_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of events',
	journey_id INT NOT NULL comment 'Forign key, not null',
	title VARCHAR(100) NOT NULL comment 'The title of event, not null',
	description TEXT DEFAULT NULL comment 'The description of event, not null',
	location_id INT DEFAULT NULL comment 'Forign key',
	event_image VARCHAR(255) comment 'The event_image of event',
    start_time TIMESTAMP DEFAULT NULL comment 'The start_date of event',
    end_time TIMESTAMP DEFAULT NULL comment 'The end_date of event',
	display ENUM('public','private','only_friends') NOT NULL DEFAULT 'private' comment 'The display mode of journey, not null',
	status ENUM('open','hidden')NOT NULL DEFAULT 'open' comment 'The status of event, not null',
	created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP comment 'Automatically generated and updated time',
    PRIMARY KEY (`event_id`),
	CONSTRAINT fk_journey_id_in_events FOREIGN KEY (journey_id)
        REFERENCES journeys (journey_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT fk_location_id_in_events FOREIGN KEY (location_id)
        REFERENCES locations (location_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE TABLE IF NOT EXISTS announcements(
	a_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of announcements',
	user_id INT NOT NULL comment 'Forign key, not null',
    title TEXT NOT NULL comment 'The title of announcement, not null',
	content TEXT NOT NULL comment 'The content of announcement, not null',
    start_date datetime NOT NULL comment 'The start_date of announcement, not null',
    end_date datetime NOT NULL comment 'The end_date of announcement, not null',
	created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP comment 'Automatically generated and updated time',
    PRIMARY KEY (`a_id`),
	CONSTRAINT fk_user_id_in_announcements FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

DROP TABLE IF EXISTS event_images;
CREATE TABLE event_images (
    image_id INT PRIMARY KEY AUTO_INCREMENT,
    event_id INT,
    event_image VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW()
);

DROP TABLE IF EXISTS subscriptions;
CREATE TABLE IF NOT EXISTS subscriptions (
    s_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of subscriptions',
    s_name VARCHAR(50) NOT NULL comment 'The name of subscriptions',
    s_description VARCHAR(100) NOT NULL comment 'The description of subscriptions',
    period INT NOT NULL comment 'The period of subscription, not null',
    base_price Decimal(10,2) NOT NULL comment 'The base price of subscription, not null',
    discount INT NOT NULL comment 'The discount of subscription, not null',
    PRIMARY KEY (`s_id`)
);

DROP TABLE IF EXISTS country_tax;
CREATE TABLE IF NOT EXISTS country_tax (
    c_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of tax',
    country varchar(50) NOT NULL comment 'The country of tax, not null',
    rate INT DEFAULT NULL comment 'The rate of base price, could be null',
    fixed_tax decimal(10,2) DEFAULT NULL comment 'The fixed tax of base price, could be null',
    PRIMARY KEY (`c_id`)
);

DROP TABLE IF EXISTS members;
CREATE TABLE IF NOT EXISTS members (
    m_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of members',
    user_id INT NOT NULL comment 'The primary id of user, not null',
    m_status ENUM('subscribed','expired','paused') NOT NULL DEFAULT 'subscribed' comment 'The status for subscription, not null',
    end_time TIMESTAMP NOT NULL DEFAULT NOW() comment 'The end time of subscription, not null',
    PRIMARY KEY (`m_id`),
    CONSTRAINT fk_user_id_in_members FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

DROP TABLE IF EXISTS paused_members;
CREATE TABLE IF NOT EXISTS paused_members (
    p_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of paused_member',
    m_id INT NOT NULL comment 'Primary id of members',
    user_id INT NOT NULL comment 'The primary id of user, not null',
    paused_time TIMESTAMP NOT NULL DEFAULT NOW() comment 'The paused time of the member, not null',
    rest_days INT NOT NULL DEFAULT 0 comment 'The rest days of subscription, not null',
    PRIMARY KEY (`p_id`),
    CONSTRAINT fk_member_id_in_paused_members FOREIGN KEY (m_id)
        REFERENCES members (m_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

DROP TABLE IF EXISTS subscription_history;
CREATE TABLE IF NOT EXISTS subscription_history (
    h_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of subscription_history',
    m_id INT NOT NULL comment 'Primary id of members',
    s_id INT NOT NULL comment 'Primary id of subscriptions',
    c_id INT DEFAULT NULL comment 'country tax of subscriptions',
    price Decimal(10,2) NOT NULL comment 'The price of subscriptions',
    gst_rate INT NOT NULL comment 'The GST of subscriptions',
    total_amount Decimal(10,2) NOT NULL comment 'The amount of subscriptions',
    payment VARCHAR(50) NOT NULL comment 'The payment of subscriptions',
    start_time TIMESTAMP NOT NULL DEFAULT NOW() comment 'The start time of the subscription, not null',
    end_time TIMESTAMP DEFAULT NULL DEFAULT NOW() comment 'The end time of the subscription, could be null due to pause',
    create_time TIMESTAMP NOT NULL DEFAULT NOW() comment 'The create time of the subscription, not null',
    transaction_id varchar(50)  DEFAULT NULL comment 'The transaction id of the subscription history, not null',
    PRIMARY KEY (`h_id`),
    CONSTRAINT fk_member_id_in_history FOREIGN KEY (m_id)
        REFERENCES members (m_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT fk_subscription_id_in_history FOREIGN KEY (s_id)
        REFERENCES subscriptions (s_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT fk_country_tax_id_in_history FOREIGN KEY (c_id)
        REFERENCES country_tax (c_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

alter table journeys change column display display ENUM('public','private','published') NOT NULL DEFAULT 'private' comment 'The display mode of journey, not null';
alter table events change column display display ENUM('public','private','published') NOT NULL DEFAULT 'private' comment 'The display mode of event, not null';

DROP TABLE IF EXISTS event_images;
CREATE TABLE event_images (
    image_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of event_images',
    event_id INT NOT NULL comment 'Primary id of events',
    event_image VARCHAR(255) comment 'The event_image of event',
    created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
    PRIMARY KEY (`image_id`),
	CONSTRAINT fk_event_id_in_event_images FOREIGN KEY (event_id)
        REFERENCES events (event_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

alter table journeys add column cover_image VARCHAR(255) DEFAULT NULL comment 'The cover image of journeys';

alter table members ADD note_msg varchar(50) default NULL comment 'Notification of members';
alter table members ADD note_ignore bool default False comment 'Ignoration of notification';

DROP TABLE IF EXISTS journey_follows;
CREATE TABLE IF NOT EXISTS journey_follows (
    follow_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    journey_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (journey_id) REFERENCES journeys(journey_id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (user_id, journey_id)
); 

-- Create the user_follows table to track user following relationships

DROP TABLE IF EXISTS user_follows;
CREATE TABLE IF NOT EXISTS user_follows (
    follow_id INT AUTO_INCREMENT PRIMARY KEY,
    follower_id INT NOT NULL,
    followed_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (follower_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (followed_id) REFERENCES users(user_id) ON DELETE CASCADE,
    UNIQUE KEY unique_user_follow (follower_id, followed_id),
    INDEX idx_follower (follower_id),
    INDEX idx_followed (followed_id)
);


-- Table for storing location follows
DROP TABLE IF EXISTS location_follows;
CREATE TABLE IF NOT EXISTS location_follows (
    lf_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    location_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (location_id) REFERENCES locations(location_id) ON DELETE CASCADE,
    UNIQUE KEY unique_follow (user_id, location_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci; 

DROP TABLE IF EXISTS event_likes;
CREATE TABLE event_likes (
    like_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (event_id, user_id),
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS event_comments;
CREATE TABLE event_comments (
    comment_id INT AUTO_INCREMENT PRIMARY KEY,
    event_id INT NOT NULL,
    user_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_hidden BOOLEAN DEFAULT FALSE,
    moderation_reason TEXT DEFAULT NULL, 
    moderator_id INT DEFAULT NULL,      
    moderated_at TIMESTAMP NULL DEFAULT NULL, 
    FOREIGN KEY (event_id) REFERENCES events(event_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (moderator_id) REFERENCES users(user_id) ON DELETE SET NULL 
);

DROP TABLE IF EXISTS comment_reactions;
CREATE TABLE IF NOT EXISTS comment_reactions (
    reaction_id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id INT NOT NULL,
    reaction ENUM('like', 'dislike') NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES event_comments(comment_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS comment_reports;
CREATE TABLE comment_reports (
    report_id INT AUTO_INCREMENT PRIMARY KEY,
    comment_id INT NOT NULL,
    user_id INT NOT NULL,
    reason ENUM('spam', 'offensive', 'abusive', 'other') NOT NULL,
    details TEXT,
    status ENUM('pending', 'reviewed', 'escalated', 'hidden', 'dismissed') DEFAULT 'pending', -- Updated ENUM
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    reviewed_at TIMESTAMP NULL,
    reviewed_by INT DEFAULT NULL,
    UNIQUE (comment_id, user_id),
    FOREIGN KEY (comment_id) REFERENCES event_comments(comment_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (reviewed_by) REFERENCES users(user_id) ON DELETE SET NULL -- ADDED Foreign key constraint for reviewed_by
);

DROP TABLE IF EXISTS private_messages;
CREATE TABLE private_messages (
    message_id INT AUTO_INCREMENT PRIMARY KEY,
    conversation_id INT NOT NULL,
    sender_id INT NOT NULL,
    recipient_id INT NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    is_read BOOLEAN DEFAULT FALSE,
    FOREIGN KEY (sender_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (recipient_id) REFERENCES users(user_id) ON DELETE CASCADE
);

DROP TABLE IF EXISTS conversations;
CREATE TABLE conversations (
    conversation_id INT AUTO_INCREMENT PRIMARY KEY,
    user1_id INT NOT NULL,
    user2_id INT NOT NULL,
    last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (user1_id, user2_id),
    FOREIGN KEY (user1_id) REFERENCES users(user_id) ON DELETE CASCADE,
    FOREIGN KEY (user2_id) REFERENCES users(user_id) ON DELETE CASCADE
);

ALTER TABLE users
MODIFY COLUMN role ENUM('traveller', 'editor', 'admin', 'moderator','support_tech') DEFAULT 'traveller';

SET FOREIGN_KEY_CHECKS=1;

ALTER TABLE users
ADD COLUMN favorite_destinations TEXT  COMMENT "User\'s favorite travel destinations",
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Profile visibility (TRUE for public, FALSE for private)';

DROP TABLE IF EXISTS announcements;
CREATE TABLE IF NOT EXISTS announcements(
	a_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of announcements',
	user_id INT NOT NULL comment 'Foreign key, not null',
    title TEXT NOT NULL comment 'The title of announcement, not null',
	content TEXT NOT NULL comment 'The content of announcement, not null',
    start_date datetime NOT NULL DEFAULT NOW() comment 'The start_date of announcement, not null',
    end_date datetime NOT NULL DEFAULT NOW() comment 'The end_date of announcement, not null',
	created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
	updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP comment 'Automatically generated and updated time',
    PRIMARY KEY (`a_id`),
	CONSTRAINT fk_user_id_in_announcements FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

-- Record last and current login time. Announcements after last login time should be marked as new, announcements after current login time should also be marked as new?
-- Logout time is not easy to capture, so do we need to use two login times here?
-- Yes, we need them. Last login time is used for new tags, current login time is used to update last login time.
-- If logout is not captured, we should update this table at login time, moving the old current to last
DROP TABLE IF EXISTS user_login_info;
CREATE TABLE IF NOT EXISTS user_login_info(
    user_id INT NOT NULL AUTO_INCREMENT comment 'Primary id of user_login_info',
    last_login TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically login time',
    current_login TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically login time',
    PRIMARY KEY (`user_id`),
    CONSTRAINT fk_user_id_in_user_login_info FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

DROP TABLE IF EXISTS user_read_announcements;
CREATE TABLE IF NOT EXISTS user_read_announcements(
    user_id INT NOT NULL comment 'user_id of user_read_announcements',
    a_id INT NOT NULL comment 'announcement id of user_read_announcements',
    a_created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
    created_at TIMESTAMP NOT NULL DEFAULT NOW() comment 'Automatically generated time',
    PRIMARY KEY (`user_id`,`a_id`),
    CONSTRAINT fk_user_id_in_ua FOREIGN KEY (user_id)
        REFERENCES users (user_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION,
	CONSTRAINT fk_a_id_in_ua FOREIGN KEY (a_id)
        REFERENCES announcements (a_id)
        ON DELETE NO ACTION ON UPDATE NO ACTION
);

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

DROP TABLE IF EXISTS help_requests;
CREATE TABLE IF NOT EXISTS help_requests (
    request_id INT NOT NULL AUTO_INCREMENT COMMENT 'Primary key for help requests',
    user_id INT NOT NULL COMMENT 'Foreign key to users table - who submitted the request',
    subject VARCHAR(255) NOT NULL COMMENT 'Subject/title of the help request',
    description TEXT NOT NULL COMMENT 'Detailed description of the issue or request',
    category ENUM('bug_report', 'technical_issue', 'account_help', 'feature_request', 'other') NOT NULL DEFAULT 'other' COMMENT 'Category of the help request',
    status ENUM('new', 'open', 'stalled', 'resolved') NOT NULL DEFAULT 'new' COMMENT 'Current status: new->open->stalled/resolved. Cannot go back from open to new',
    priority ENUM('low', 'medium', 'high', 'urgent') NOT NULL DEFAULT 'medium' COMMENT 'Priority level of the request',
    assigned_to INT DEFAULT NULL COMMENT 'Foreign key to users table - support tech assigned to handle this request',
    admin_notes TEXT DEFAULT NULL COMMENT 'Internal notes from support team',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the request was created',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When the request was last updated',
    resolved_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When the request was resolved',
    status_changed_at TIMESTAMP NULL DEFAULT NULL COMMENT 'When the status was last changed',
    status_changed_by INT NULL DEFAULT NULL COMMENT 'Who changed the status',
    PRIMARY KEY (request_id),
    CONSTRAINT fk_help_requests_user_id FOREIGN KEY (user_id) 
        REFERENCES users (user_id) 
        ON DELETE NO ACTION ON UPDATE NO ACTION,
    CONSTRAINT fk_help_requests_assigned_to FOREIGN KEY (assigned_to) 
        REFERENCES users (user_id) 
        ON DELETE SET NULL ON UPDATE NO ACTION,
    CONSTRAINT fk_help_requests_status_changed_by FOREIGN KEY (status_changed_by) 
        REFERENCES users (user_id) 
        ON DELETE SET NULL ON UPDATE NO ACTION,
    INDEX idx_help_requests_status (status),
    INDEX idx_help_requests_category (category),
    INDEX idx_help_requests_user_id (user_id),
    INDEX idx_help_requests_assigned_to (assigned_to),
    INDEX idx_help_requests_created_at (created_at),
    INDEX idx_help_requests_status_changed (status, status_changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Help requests and bug reports from users';

-- ====================================================================
-- STEP 3: CREATE HELP_REQUEST_REPLIES TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS help_request_replies (
    reply_id INT NOT NULL AUTO_INCREMENT COMMENT 'Primary key for replies',
    request_id INT NOT NULL COMMENT 'Foreign key to help_requests table',
    user_id INT NOT NULL COMMENT 'Foreign key to users table - who posted the reply',
    message TEXT NOT NULL COMMENT 'The reply message content',
    is_staff_reply BOOLEAN NOT NULL DEFAULT FALSE COMMENT 'Whether this reply is from support staff',
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT 'When the reply was posted',
    updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT 'When the reply was last updated',
    PRIMARY KEY (reply_id),
    CONSTRAINT fk_help_replies_request_id FOREIGN KEY (request_id) 
        REFERENCES help_requests (request_id) 
        ON DELETE CASCADE ON UPDATE NO ACTION,
    CONSTRAINT fk_help_replies_user_id FOREIGN KEY (user_id) 
        REFERENCES users (user_id) 
        ON DELETE CASCADE ON UPDATE NO ACTION,
    INDEX idx_help_replies_request_id (request_id),
    INDEX idx_help_replies_created_at (created_at),
    INDEX idx_help_replies_user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Replies to help requests from users and support staff';

-- ====================================================================
-- STEP 4: CREATE HELP_DESK_NOTIFICATIONS TABLE
-- ====================================================================

CREATE TABLE IF NOT EXISTS help_desk_notifications (
    notification_id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL COMMENT 'User who should receive the notification',
    request_id INT NOT NULL COMMENT 'Help request that was assigned',
    message TEXT NOT NULL COMMENT 'Notification message',
    is_read BOOLEAN DEFAULT FALSE COMMENT 'Whether the notification has been read',
    assigned_by INT NOT NULL COMMENT 'User who made the assignment',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    read_at TIMESTAMP NULL COMMENT 'When the notification was read',
    
    -- Foreign key constraints
    CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id) 
        REFERENCES users(user_id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_request_id FOREIGN KEY (request_id) 
        REFERENCES help_requests(request_id) ON DELETE CASCADE,
    CONSTRAINT fk_notifications_assigned_by FOREIGN KEY (assigned_by) 
        REFERENCES users(user_id) ON DELETE CASCADE,
    
    -- Indexes for performance
    INDEX idx_notifications_user_id (user_id),
    INDEX idx_notifications_request_id (request_id),
    INDEX idx_notifications_is_read (is_read),
    INDEX idx_notifications_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='Notifications for help desk staff';

SET FOREIGN_KEY_CHECKS=1;
