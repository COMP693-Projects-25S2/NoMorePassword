use comp639_project1;

SET FOREIGN_KEY_CHECKS=0;

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

SET FOREIGN_KEY_CHECKS=1;