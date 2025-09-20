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
SET FOREIGN_KEY_CHECKS=1;
