-- ====================================================================
-- Help Desk System Complete Database Setup
-- ====================================================================
-- This script sets up the complete Help Desk system with all required tables:
-- 1. help_requests table - main help request records
-- 2. help_request_replies table - conversation functionality  
-- 3. help_desk_notifications table - notification system
-- 4. Proper indexes and constraints for performance
-- 5. Compatible with existing users table
-- ====================================================================

USE comp639_project1;

-- Turn off foreign key checks temporarily for table creation
SET FOREIGN_KEY_CHECKS=0;
SET SQL_SAFE_UPDATES = 0;

-- ====================================================================
-- STEP 1: ENSURE SUPPORT_TECH ROLE EXISTS
-- ====================================================================

-- Add support_tech role to users table if it doesn't exist
-- This is required for Help Desk functionality
SET @sql = (SELECT IF(
    (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS 
     WHERE TABLE_SCHEMA = 'comp639_project1' 
     AND TABLE_NAME = 'users' 
     AND COLUMN_NAME = 'role' 
     AND COLUMN_TYPE LIKE '%support_tech%') = 0,
    "ALTER TABLE users MODIFY COLUMN role ENUM('traveller', 'editor', 'admin', 'moderator', 'support_tech') DEFAULT 'traveller'",
    "SELECT 'support_tech role already exists' as message"
));

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====================================================================
-- STEP 2: CREATE HELP_REQUESTS TABLE
-- ====================================================================
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



-- ====================================================================
-- STEP 5: DATA MIGRATION FOR EXISTING HELP_REQUESTS TABLE
-- ====================================================================

-- Handle existing data if help_requests table already exists with old schema
-- This section will safely update existing data to the new schema

-- First, check if help_requests table exists and expand ENUM if needed
SET @table_exists = (
    SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES 
    WHERE TABLE_SCHEMA = 'comp639_project1' 
    AND TABLE_NAME = 'help_requests'
);

-- If table exists, temporarily expand the ENUM to include both old and new values
SET @sql = IF(@table_exists > 0,
    "ALTER TABLE help_requests MODIFY COLUMN status ENUM('new', 'in_progress', 'resolved', 'closed', 'open', 'stalled') NOT NULL DEFAULT 'new'",
    "SELECT 'help_requests table does not exist yet' as message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Check if we need to migrate existing status values
SET @old_status_count = (
    SELECT COALESCE((
        SELECT COUNT(*) FROM help_requests 
        WHERE status IN ('in_progress', 'closed')
    ), 0)
);

-- If there are old status values, migrate them
UPDATE help_requests 
SET status = 'open' 
WHERE status = 'in_progress';

UPDATE help_requests 
SET status = 'resolved' 
WHERE status = 'closed';

-- Set status_changed_at for existing records if it's NULL
UPDATE help_requests 
SET status_changed_at = created_at 
WHERE status_changed_at IS NULL;

-- Finally, if table exists, modify the ENUM to only support the new workflow
SET @sql = IF(@table_exists > 0,
    "ALTER TABLE help_requests MODIFY COLUMN status ENUM('new', 'open', 'stalled', 'resolved') NOT NULL DEFAULT 'new' COMMENT 'Current status: new->open->stalled/resolved. Cannot go back from open to new'",
    "SELECT 'No need to update ENUM for new table' as message"
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- ====================================================================
-- STEP 6: CREATE SAMPLE SUPPORT STAFF USERS (Optional)
-- ====================================================================

-- Create a sample support technician if it doesn't exist
-- INSERT IGNORE INTO users (username, password_hash, email, first_name, last_name, role, status)
-- VALUES 
--     ('support_tech1', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewnlWQ2vPfHzjJZy', 'support1@traveltales.com', 'Support', 'Tech', 'support_tech', 'active'),
--     ('admin_help', '$2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewnlWQ2vPfHzjJZy', 'admin@traveltales.com', 'Admin', 'Helper', 'admin', 'active');

-- ====================================================================
-- STEP 7: VERIFICATION AND SUMMARY
-- ====================================================================

-- Verify tables were created successfully
SELECT 
    'help_requests' as table_name,
    COUNT(*) as record_count,
    'Main help request table' as description
FROM help_requests
UNION ALL
SELECT 
    'help_request_replies' as table_name,
    COUNT(*) as record_count,
    'Conversation replies table' as description
FROM help_request_replies
UNION ALL
SELECT 
    'help_desk_notifications' as table_name,
    COUNT(*) as record_count,
    'Notification system table' as description
FROM help_desk_notifications;

-- Show table structures for verification
SHOW CREATE TABLE help_requests;
SHOW CREATE TABLE help_request_replies;
SHOW CREATE TABLE help_desk_notifications;

-- ====================================================================
-- SETUP COMPLETE
-- ====================================================================

SELECT 'Help Desk Database Setup Completed Successfully!' as Status,
       'All tables created with proper constraints and indexes' as Details,
       'Ready for Help Desk functionality' as Ready; 

-- ====================================================================
-- Help Desk Sample Data
-- ====================================================================
-- This script creates sample data for testing the Help Desk functionality
-- Note: Run this AFTER helpdesk_complete_database_setup.sql
-- ====================================================================


-- ====================================================================
-- SAMPLE HELP REQUESTS
-- ====================================================================

-- Sample help requests (assuming user IDs 1-5 exist)
INSERT IGNORE INTO help_requests (user_id, subject, description, category, status, priority, created_at) VALUES
(1, 'Unable to Upload Travel Photos', 'I am trying to upload photos to my journey, but every time I get an "Upload Failed" error. I have tried different image formats (JPG, PNG), but the problem persists. Please help me resolve this issue.', 'technical_issue', 'new', 'medium', NOW() - INTERVAL 2 HOUR),

(2, 'Account Login Issues', 'I cannot log into my account even though I am sure my password is correct. I have tried resetting it twice but still cannot access my account.', 'account_help', 'open', 'high', NOW() - INTERVAL 1 DAY),

(3, 'Search Function Not Working', 'The search feature on the journey page is not returning any results, even for journeys I know exist. This has been happening for the past week.', 'bug_report', 'new', 'medium', NOW() - INTERVAL 3 HOUR),

(4, 'Feature Request: Map Integration', 'I suggest integrating map functionality into journey pages so users can see journey routes and event locations on a map. This would greatly enhance the user experience.', 'feature_request', 'stalled', 'low', NOW() - INTERVAL 2 DAY),

(5, 'Premium Subscription Not Working', 'I purchased a premium subscription yesterday but I still cannot access premium features. The payment went through successfully.', 'account_help', 'resolved', 'urgent', NOW() - INTERVAL 5 DAY);

-- ====================================================================
-- SAMPLE REPLIES
-- ====================================================================

-- Get the request IDs for adding replies
SET @req1 = (SELECT request_id FROM help_requests WHERE subject = 'Account Login Issues' LIMIT 1);
SET @req2 = (SELECT request_id FROM help_requests WHERE subject = 'Premium Subscription Not Working' LIMIT 1);
SET @req3 = (SELECT request_id FROM help_requests WHERE subject = 'Feature Request: Map Integration' LIMIT 1);

-- Sample replies (assuming support_tech1 user exists)
SET @support_id = (SELECT user_id FROM users WHERE username = 'support_tech1' LIMIT 1);

-- Replies for Account Login Issues
INSERT IGNORE INTO help_request_replies (request_id, user_id, message, is_staff_reply, created_at) VALUES
(@req1, @support_id, 'Thank you for contacting us. I have reviewed your account and found that it may have been temporarily locked due to multiple failed login attempts. I am unlocking it now. Please try logging in again and let me know if you still have issues.', true, NOW() - INTERVAL 20 HOUR),
(@req1, 2, 'Thank you for the quick response! I was able to log in successfully. The issue is resolved.', false, NOW() - INTERVAL 19 HOUR);

-- Replies for Premium Subscription
INSERT IGNORE INTO help_request_replies (request_id, user_id, message, is_staff_reply, created_at) VALUES
(@req2, @support_id, 'I have checked your payment and activated your premium subscription. You should now have access to all premium features. Please log out and log back in to refresh your session.', true, NOW() - INTERVAL 4 DAY),
(@req2, 5, 'Perfect! Everything is working now. Thank you for the quick resolution!', false, NOW() - INTERVAL 4 DAY);

-- Replies for Feature Request
INSERT IGNORE INTO help_request_replies (request_id, user_id, message, is_staff_reply, created_at) VALUES
(@req3, @support_id, 'Thank you for this excellent feature suggestion! We have added it to our development roadmap. While we cannot provide a specific timeline, this is definitely something we are considering for future updates.', true, NOW() - INTERVAL 1 DAY);

-- ====================================================================
-- UPDATE ASSIGNMENTS AND STATUS TRACKING
-- ====================================================================

-- Assign some requests to support staff and update status tracking
UPDATE help_requests 
SET assigned_to = @support_id, 
    status_changed_at = NOW() - INTERVAL 20 HOUR,
    status_changed_by = @support_id
WHERE subject = 'Account Login Issues';

UPDATE help_requests 
SET assigned_to = @support_id,
    resolved_at = NOW() - INTERVAL 4 DAY,
    status_changed_at = NOW() - INTERVAL 4 DAY,
    status_changed_by = @support_id
WHERE subject = 'Premium Subscription Not Working';

UPDATE help_requests 
SET assigned_to = @support_id,
    status_changed_at = NOW() - INTERVAL 1 DAY,
    status_changed_by = @support_id,
    admin_notes = 'Added to development roadmap for Q2. Need to research mapping APIs and integration options.'
WHERE subject = 'Feature Request: Map Integration';

-- ====================================================================
-- SAMPLE NOTIFICATIONS
-- ====================================================================

-- Create sample notifications (these would normally be created by the application)
INSERT IGNORE INTO help_desk_notifications (user_id, request_id, message, assigned_by, created_at) VALUES
(@support_id, @req1, 'You have been assigned to Help Request #' + CAST(@req1 AS CHAR) + ': Account Login Issues (assigned by admin)', 1, NOW() - INTERVAL 20 HOUR),
(@support_id, @req2, 'You have been assigned to Help Request #' + CAST(@req2 AS CHAR) + ': Premium Subscription Not Working (assigned by admin)', 1, NOW() - INTERVAL 4 DAY);

-- ====================================================================
-- VERIFICATION
-- ====================================================================

-- Show summary of created data
SELECT 
    'Help Requests Created' as DataType,
    COUNT(*) as Count
FROM help_requests
UNION ALL
SELECT 
    'Replies Created' as DataType,
    COUNT(*) as Count
FROM help_request_replies
UNION ALL
SELECT 
    'Notifications Created' as DataType,
    COUNT(*) as Count
FROM help_desk_notifications;

-- Show sample requests with their status
SELECT 
    request_id,
    subject,
    category,
    status,
    priority,
    CASE WHEN assigned_to IS NOT NULL THEN 'Assigned' ELSE 'Unassigned' END as assignment_status,
    created_at
FROM help_requests
ORDER BY created_at DESC;

SELECT 'Help Desk Sample Data Created Successfully!' as Status; 

-- Turn foreign key checks back on
SET FOREIGN_KEY_CHECKS=1;
SET SQL_SAFE_UPDATES = 1;