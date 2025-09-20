# TravelTales

TravelTales is a web application for travelers to document, organize, and share their journey experiences. Users can create personal travel journals, add events with photos, and share their adventures with others.

![TravelTales Homepage](./webapp/static/ui_photos/homepage_screenshot.png)

## Live Demo

The application is currently deployed on PythonAnywhere:
https://comp639project1nsn.pythonanywhere.com

## Image References

- new journey.jpg: Photo from TripAdvisor, Southern Crossing Tour, Christchurch, NZ
  Source: https://www.tripadvisor.co.nz/AttractionProductReview-g255118-d21244638-8_Day_Southern_Crossing_Small_Group_Tour-Christchurch_Canterbury_Region_South_Isla.html

- View my journey.jpg: Photo from TripAdvisor, Reykjavik, Iceland
  Source: https://www.tripadvisor.co.nz/Tourism-g189970-Reykjavik_Capital_Region-Vacations.html

- in the world.jpg: Photo from TripAdvisor, Paris, France
  Source: https://www.tripadvisor.co.nz/Tourism-g187147-Paris_Ile_de_France-Vacations.html

## Features

- **User Management System**
  - User registration and authentication
  - Role-based access control (Admin, Editor, Traveller)
  - User profiles with customizable avatars and descriptions

- **Journey Management**
  - Create private or public journeys
  - Organize journeys by date, location, and title
  - Search journeys by content or location

- **Event Tracking**
  - Document events within journeys with titles, descriptions, and timestamps
  - Add photos to events
  - Track locations for each event

- **Admin Capabilities**
  - User management interface for administrators
  - Ability to promote/demote user roles
  - Content moderation (hiding/showing journeys)

## Technology Stack

- **Backend**: Python Flask
- **Database**: MySQL
- **Frontend**: HTML, CSS, JavaScript, Bootstrap 5
- **Authentication**: Flask-Bcrypt
- **File Storage**: Local file system

## Installation

### Prerequisites

- Python 3.8+
- MySQL
- pip

### Setup

1. Clone the repository:
   ```
   git clone https://github.com/LUMasterOfAppliedComputing2025S1/COMP639_Project_1_NSN.git
   cd COMP639_Project_1_NSN
   ```

2. Install required packages:
   ```
   pip install -r requirements.txt
   ```

3. Set up the database:
   - Create a MySQL database
   - Import the database schema from `sql/create_table_v_0.4.sql`
   - Configure database connection in `webapp/db.py`

4. Run the application:
   ```
   python3 run.py
   ```

5. Access the application:
   - Local development: `http://127.0.0.1:5000`
   - Production: https://comp639project1nsn.pythonanywhere.com

## Usage

### User Types

- **Traveller**: Regular users who can create and manage their own journeys
- **Editor**: Can manage content across the platform, including public journeys
- **Admin**: Full access to all features, including user management

### Creating a Journey

1. Log in to your account
2. Navigate to "My Journeys"
3. Click "Add Journey"
4. Fill in the journey details (title, description, start date)
5. Choose whether to make it public or private

### Adding Events to a Journey

1. Open a journey
2. Click "Add Event"
3. Fill in event details (title, description, location, date/time)
4. Optionally add a photo
5. Save the event

## Contributing

We welcome contributions to TravelTales! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Team

- COMP639 Studio Project - Team NSN
- University of Canterbury
- 2025