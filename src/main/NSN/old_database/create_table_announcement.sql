use comp639_project1;

SET FOREIGN_KEY_CHECKS=0;

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

SET FOREIGN_KEY_CHECKS=1;

