use comp639_project1;

SET FOREIGN_KEY_CHECKS=0;

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
MODIFY COLUMN role ENUM('traveller', 'editor', 'admin', 'moderator') DEFAULT 'traveller';

SET FOREIGN_KEY_CHECKS=1;

ALTER TABLE users
ADD COLUMN favorite_destinations TEXT  COMMENT "User\'s favorite travel destinations",
ADD COLUMN is_public BOOLEAN NOT NULL DEFAULT TRUE COMMENT 'Profile visibility (TRUE for public, FALSE for private)';