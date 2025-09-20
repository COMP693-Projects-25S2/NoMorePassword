USE comp639_project1;
-- Insert locations data
INSERT INTO `locations` (`country`, `region`, `city`, `address`)
VALUES
    ('New Zealand', 'Canterbury', 'Christchurch', '123 Main St'),
    ('New Zealand', 'Canterbury', 'Lincoln', '456 University Way'),
    ('Australia', 'New South Wales', 'Sydney', '789 Harbor View');

-- Insert users data
INSERT INTO `users` (`username`, `password_hash`, `email`, `first_name`, `last_name`, `location_id`, `description`, `profile_image`, `role`, `status`)
VALUES
    ('admin1', '$2b$12$v9QTTuW/kzp/OPs3b.eRjucliLFItbzjpfhqy3inAoDPxlXQaYvbC', 'admin1@example.com', 'Admin', 'User', 2, 'System Administrator', 'admin1.jpg', 'admin', 'active'),

    ('editor1', '$2b$12$M4r4FPZKb.Lopi751AODGOQgsw2aSQjsldGFQp884z2nhADG2BYaO', 'editor1@example.com', 'Mike', 'Editor', 2, 'Senior Editor', 'editor1.jpg', 'editor', 'active'),
    ('editor2', '$2b$12$M/VP/CDdhe1nC2uVBa77tufbz/fh6oW218eMIxkFWep0n3H/PkI0q', 'editor2@example.com', 'Sarah', 'Content', 1, 'Content Expert', 'editor2.jpg', 'editor', 'active'),

    ('traveller1', '$2b$12$0q1ckudJpEVbbAW659jomu8UHph1Nt1RHN/NS0NvCE5mb6HMeWIsW', 'traveller1@example.com', 'John', 'Doe', 1, 'Adventure enthusiast who loves traveling', 'traveller1.jpg', 'traveller', 'active'),
    ('traveller2', '$2b$12$ZwGg83Q2XDGEannnaGua3eMsT4W2rihftvod5yZ.VatpkXkv9a2Qy', 'traveller2@example.com', 'Jane', 'Smith', 3, 'Photography lover who enjoys documenting travel moments', 'traveller2.jpg', 'traveller', 'active'),
    ('inactive_user', '$2b$12$6KPIL1c77kZpDXzDDRuJV.ielxGNDUIJPkxl0K5JdQoZTMrcIMBym', 'inactive@example.com', 'Inactive', 'User', NULL, 'Inactive user', NULL, 'traveller', 'inactive');

-- Insert journeys data
INSERT INTO `journeys` (`user_id`, `title`, `description`, `start_date`, `display`, `status`)
VALUES
    (4, 'South Island New Zealand Tour', 'Exploring the natural landscapes and cultural attractions of New Zealand South Island', '2023-01-15 00:00:00', 'public', 'open'),
    (4, 'Private Travel Journal', 'My personal travel records, not shared publicly', '2023-03-20 00:00:00', 'private', 'open'),
    (5, 'One Week in Sydney, Australia', 'Visiting famous landmarks including Sydney Opera House and Bondi Beach', '2023-02-10 00:00:00', 'public', 'open'),
    (5, 'Hidden Travel Plans', 'Travel currently in planning stage, temporarily hidden', '2023-05-01 00:00:00', 'private', 'hidden');

-- Insert events data
INSERT INTO `events` (`journey_id`, `title`, `description`, `location_id`, `event_image`, `start_time`, `end_time`, `display`, `status`)
VALUES
    (1, 'Christchurch City Tour', 'Visiting Christchurch city center and botanical gardens', 1, 'christchurch.jpg', '2023-01-16 09:00:00', '2023-01-16 17:00:00', 'public', 'open'),
    (1, 'Lincoln University Visit', 'Tour of the famous Lincoln University in New Zealand', 2, 'lincoln_univ.jpg', '2023-01-18 10:00:00', '2023-01-18 15:00:00', 'private', 'open'),
    (3, 'Sydney Opera House Tour', 'Visiting the world-famous Sydney Opera House', 3, 'sydney_opera.jpg', '2023-02-11 09:00:00', '2023-02-11 13:00:00', 'public', 'open'),
    (3, 'Day Trip to Bondi Beach', 'Relaxing and surfing at the famous Bondi Beach', 3, 'bondi_beach.jpg', '2023-02-12 08:00:00', '2023-02-12 18:00:00', 'only_friends', 'open');

-- Insert announcements data
INSERT INTO `announcements` (`user_id`, `title`, `content`, `start_date`, `end_date`)
VALUES
    (1, 'System Maintenance Notice', 'The system will undergo maintenance upgrades on April 1, 2023, during which service will be temporarily interrupted.', '2023-03-25 00:00:00', '2023-04-02 00:00:00'),
    (1, 'New Feature Release', 'We have added a new travel route planning feature. Welcome to try it out!', '2023-05-01 00:00:00', '2023-05-15 00:00:00'),
    (2, 'Editor\'s Recommendation', 'This month\'s recommended travel destination: Queenstown, New Zealand. Explore the beauty of nature.', '2023-03-01 00:00:00', '2023-03-31 00:00:00');